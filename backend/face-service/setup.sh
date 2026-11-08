#!/usr/bin/env bash
# Installs the face service and downloads its models. Safe to run again.
#   ./setup.sh           the default models
#   ./setup.sh arcface   also the InsightFace model. Read the license note in README.md first.
set -euo pipefail
cd "$(dirname "$0")"

python3 -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
mkdir -p models

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

# Models are large and this runs on the live server, so never trust a download without checking it.
fetch() {
  local name=$1 url=$2 expected=$3 target="models/$1"
  if [[ -f "$target" && "$(sha256 "$target")" == "$expected" ]]; then echo "Have $name"; return; fi
  echo "Downloading $name"
  curl --fail --location --silent --show-error --output "$target.part" "$url"
  if [[ "$(sha256 "$target.part")" != "$expected" ]]; then rm -f "$target.part"; echo "Checksum failed for $name" >&2; exit 1; fi
  mv "$target.part" "$target"
}

ZOO=https://github.com/opencv/opencv_zoo/raw/main/models
fetch face_detection_yunet_2023mar.onnx "$ZOO/face_detection_yunet/face_detection_yunet_2023mar.onnx" 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
fetch face_recognition_sface_2021dec.onnx "$ZOO/face_recognition_sface/face_recognition_sface_2021dec.onnx" 0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79

if [[ "${1:-}" == "arcface" ]]; then
  .venv/bin/pip install --quiet "onnxruntime>=1.17"
  expected=4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43
  if [[ ! -f models/w600k_r50.onnx || "$(sha256 models/w600k_r50.onnx)" != "$expected" ]]; then
    echo "Downloading w600k_r50.onnx"
    curl --fail --location --silent --show-error --output models/buffalo_l.zip https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip
    unzip -oq models/buffalo_l.zip w600k_r50.onnx -d models
    rm models/buffalo_l.zip
    if [[ "$(sha256 models/w600k_r50.onnx)" != "$expected" ]]; then rm -f models/w600k_r50.onnx; echo "Checksum failed for w600k_r50.onnx" >&2; exit 1; fi
  fi
fi
echo "Face service is ready."
