"""Finds faces in a camera frame and turns each one into an embedding.

Stateless on purpose: frames are analysed in memory and nothing is written to disk. The Node
backend owns the saved embeddings and the matching. Listens on this machine only, so it's
only reachable through the admin routes in attendance.js.
"""
import json
import os
import threading
from urllib.parse import parse_qs, urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import cv2
import numpy as np

HOST = "127.0.0.1"
PORT = int(os.environ.get("FACE_SERVICE_PORT", "3200"))
MODEL_DIR = Path(__file__).parent / "models"
MODEL = os.environ.get("FACE_MODEL", "sface")

MAX_FRAME_BYTES = 4 * 1024 * 1024
MAX_FRAME_SIDE = 1920
MAX_FACES = 6
DETECT_SCORE = 0.7
MIN_FACE_PIXELS = 70
MIN_SHARPNESS = 25.0
MIN_BRIGHTNESS = 45.0
MAX_TURN = 0.6
PHOTO_MAX_SIDE = 480

# Tuned on LFW with a simulated 40 person team. See "Tuning" in README.md.
THRESHOLDS = {
    "sface": {"strong": 0.55, "unsure": 0.42, "same": 0.36},
    "arcface": {"strong": 0.45, "unsure": 0.28, "same": 0.25},
}
# Where the eyes, nose and mouth corners sit in the 112px crop that ArcFace expects.
ARCFACE_POINTS = np.array(
    [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]],
    dtype=np.float32,
)

if MODEL not in THRESHOLDS:
    raise SystemExit(f"FACE_MODEL must be one of: {', '.join(THRESHOLDS)}")

cv2.setNumThreads(2)
detector = cv2.FaceDetectorYN.create(
    str(MODEL_DIR / "face_detection_yunet_2023mar.onnx"), "", (320, 320), DETECT_SCORE, 0.3, 50
)
# The OpenCV models keep state between calls, so only one frame runs at a time.
lock = threading.Lock()


def aligned_sface():
    recognizer = cv2.FaceRecognizerSF.create(str(MODEL_DIR / "face_recognition_sface_2021dec.onnx"), "")

    def align(image, row):
        return recognizer.alignCrop(image, row)

    def embed(crop):
        return recognizer.feature(crop).ravel()

    return align, embed


def aligned_arcface():
    import onnxruntime

    options = onnxruntime.SessionOptions()
    options.intra_op_num_threads = 2
    session = onnxruntime.InferenceSession(
        str(MODEL_DIR / "w600k_r50.onnx"), options, providers=["CPUExecutionProvider"]
    )
    input_name = session.get_inputs()[0].name

    def align(image, row):
        points = row[4:14].reshape(5, 2).astype(np.float32)
        matrix, _ = cv2.estimateAffinePartial2D(points, ARCFACE_POINTS, method=cv2.LMEDS)
        return cv2.warpAffine(image, matrix, (112, 112))

    def embed(crop):
        pixels = (crop[:, :, ::-1].astype(np.float32) - 127.5) / 127.5
        return session.run(None, {input_name: pixels.transpose(2, 0, 1)[None]})[0][0]

    return align, embed


align_face, embed_face = aligned_sface() if MODEL == "sface" else aligned_arcface()


def head_turn(row):
    """0 when facing the camera, growing as the nose moves towards one eye."""
    right_eye, left_eye, nose = row[4:6], row[6:8], row[8:10]
    eye_gap = float(np.linalg.norm(left_eye - right_eye)) or 1.0
    return abs(float(nose[0]) - float(right_eye[0] + left_eye[0]) / 2) / eye_gap


def quality_of(row, crop):
    if min(row[2], row[3]) < MIN_FACE_PIXELS:
        return "too_small"
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    if float(gray.mean()) < MIN_BRIGHTNESS:
        return "dark"
    if float(cv2.Laplacian(gray, cv2.CV_64F).var()) < MIN_SHARPNESS:
        return "blurry"
    if head_turn(row) > MAX_TURN:
        return "turned"
    return "ok"


def decode(data):
    """The frame as the detector saw it, so face boxes line up with it."""
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("not an image")
    scale = min(1.0, MAX_FRAME_SIDE / max(image.shape[:2]))
    if scale < 1.0:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return image


def crop_photo(data, box):
    """A head-and-shoulders photo of one person, so nobody else in the frame is kept."""
    image = decode(data)
    x, y, w, h = box
    height, width = image.shape[:2]
    left, right = int(max(0, x - 0.6 * w)), int(min(width, x + 1.6 * w))
    top, bottom = int(max(0, y - 0.5 * h)), int(min(height, y + 1.6 * h))
    if right - left < 8 or bottom - top < 8:
        raise ValueError("box is outside the frame")
    piece = image[top:bottom, left:right]
    scale = min(1.0, PHOTO_MAX_SIDE / max(piece.shape[:2]))
    if scale < 1.0:
        piece = cv2.resize(piece, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return cv2.imencode(".jpg", piece, [cv2.IMWRITE_JPEG_QUALITY, 82])[1].tobytes()


def analyze(data):
    image = decode(data)
    height, width = image.shape[:2]

    faces = []
    with lock:
        detector.setInputSize((width, height))
        _, rows = detector.detect(image)
        rows = [] if rows is None else sorted(rows, key=lambda row: -row[2])[:MAX_FACES]
        for row in rows:
            crop = align_face(image, row)
            quality = quality_of(row, crop)
            face = {"box": [round(float(v), 1) for v in row[:4]], "quality": quality}
            if quality == "ok":
                vector = np.asarray(embed_face(crop), dtype=np.float64)
                face["embedding"] = (vector / np.linalg.norm(vector)).round(6).tolist()
            faces.append(face)
    return {"model": MODEL, "thresholds": THRESHOLDS[MODEL], "width": width, "height": height, "faces": faces}


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body, content_type="application/json"):
        payload = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            self.reply(200, {"ok": True, "model": MODEL})
        else:
            self.reply(404, {"error": "not found"})

    def do_POST(self):
        url = urlsplit(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        if url.path not in ("/analyze", "/crop") or not 0 < length <= MAX_FRAME_BYTES:
            self.reply(400, {"error": "send a JPEG to /analyze or /crop"})
            return
        try:
            data = self.rfile.read(length)
            if url.path == "/analyze":
                self.reply(200, analyze(data))
                return
            box = [float(v) for v in parse_qs(url.query).get("box", [""])[0].split(",")]
            if len(box) != 4:
                raise ValueError("send box=x,y,width,height")
            self.reply(200, crop_photo(data, box), "image/jpeg")
        except ValueError as error:
            self.reply(400, {"error": str(error)})

    def log_message(self, *_args):
        pass  # Frames from the admin are private, so requests aren't logged.


if __name__ == "__main__":
    print(f"TCR face service ({MODEL}) listening on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
