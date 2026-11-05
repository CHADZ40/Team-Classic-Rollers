// The hero: a real-scale bowling lane in 3D. Everything is a function of scroll
// progress, so the roll and the strike play forwards and rewind with the page.
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// Metres, with the head pin at z = 0 and the foul line 18.29 m towards the camera.
const LANE_W = 1.05;
const LANE_LEN = 18.29;
const PIN_H = 0.38;
const PIN_GAP = 0.305;
const BALL_R = 0.108;
const ROLL_START = 0.05;
export const IMPACT = 0.6;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => t * t * (3 - 2 * t);

function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

const PIN_SPOTS = (() => {
  const spots = [];
  for (let row = 0; row < 4; row += 1) {
    for (let i = 0; i <= row; i += 1) {
      spots.push({ x: (i - row / 2) * PIN_GAP, z: -row * PIN_GAP * 0.866 });
    }
  }
  return spots;
})();

function pinGeometry() {
  // Regulation-style profile, as [radius, height] from the base up.
  const profile = [
    [0, 0], [0.026, 0], [0.04, 0.03], [0.058, 0.08], [0.0605, 0.115], [0.053, 0.17], [0.036, 0.225],
    [0.024, 0.255], [0.0215, 0.275], [0.0245, 0.3], [0.031, 0.33], [0.03, 0.355], [0.021, 0.373], [0, 0.38],
  ];
  const curve = new THREE.SplineCurve(profile.map(([r, h]) => new THREE.Vector2(r, h)));
  const geometry = new THREE.LatheGeometry(curve.getPoints(48), 28);
  geometry.translate(0, -PIN_H / 2, 0);
  return geometry;
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function pinTexture() {
  return canvasTexture(64, 512, (c, w, h) => {
    c.fillStyle = "#f5f1e8";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#e11a33";
    // The neck stripes. Lathe v runs along the curve from base to crown.
    c.fillRect(0, h * 0.235, w, h * 0.028);
    c.fillRect(0, h * 0.29, w, h * 0.028);
  });
}

function laneTexture() {
  return canvasTexture(512, 4096, (c, w, h) => {
    const boards = 39;
    const bw = w / boards;
    for (let i = 0; i < boards; i += 1) {
      const tone = 0.86 + hash(i + 3) * 0.14;
      c.fillStyle = `rgb(${226 * tone}, ${184 * tone}, ${128 * tone})`;
      c.fillRect(i * bw, 0, bw + 1, h);
      c.fillStyle = "rgba(90, 58, 26, .22)";
      c.fillRect(i * bw, 0, 1, h);
    }
    // Seven aiming arrows, about 4.6 m past the foul line (top of the texture is the pins).
    c.fillStyle = "#2f55ff";
    for (let n = -3; n <= 3; n += 1) {
      const x = w / 2 + n * bw * 5;
      const y = h * (1 - 4.6 / LANE_LEN) + Math.abs(n) * h * 0.012;
      c.beginPath();
      c.moveTo(x, y - 54);
      c.lineTo(x + 7, y);
      c.lineTo(x - 7, y);
      c.closePath();
      c.fill();
    }
    c.fillStyle = "#e11a33";
    c.fillRect(0, h - 10, w, 10);
  });
}

function ballTexture(mascot) {
  return canvasTexture(2048, 1024, (c, w, h) => {
    const base = c.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, "#14161d");
    base.addColorStop(0.5, "#23262f");
    base.addColorStop(1, "#14161d");
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    // Reactive-resin swirl in team colours.
    for (let i = 0; i < 26; i += 1) {
      c.strokeStyle = i % 3 === 0 ? "rgba(47, 85, 255, .14)" : i % 3 === 1 ? "rgba(225, 26, 51, .08)" : "rgba(255, 213, 0, .04)";
      c.lineWidth = 8 + hash(i) * 30;
      c.beginPath();
      const y0 = hash(i + 9) * h;
      c.moveTo(0, y0);
      c.bezierCurveTo(w * 0.3, y0 + (hash(i + 1) - 0.5) * 700, w * 0.7, y0 + (hash(i + 2) - 0.5) * 700, w, y0);
      c.stroke();
    }
    if (mascot) {
      const size = 620;
      c.drawImage(mascot, w * 0.25 - size / 2, h / 2 - size / 2, size, size);
    }
    c.fillStyle = "#04050a";
    [[0.74, 0.42], [0.77, 0.42], [0.755, 0.5]].forEach(([x, y]) => {
      c.beginPath();
      c.arc(w * x, h * y, 24, 0, Math.PI * 2);
      c.fill();
    });
  });
}

function useEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.32;
    return () => { env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
}

function Pins({ progress, mirror = false }) {
  const refs = useRef([]);
  const geometry = useMemo(pinGeometry, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: pinTexture(), roughness: 0.22, metalness: 0.02 }), []);
  useFrame(() => {
    const t = Math.max(0, (progress.current - IMPACT) / 0.26) * 1.5;
    PIN_SPOTS.forEach((spot, i) => {
      const pin = refs.current[i];
      if (!pin) return;
      const reach = Math.hypot(spot.x, spot.z);
      const tt = Math.max(0, t - reach * 0.32);
      const side = spot.x === 0 ? (hash(i) > 0.5 ? 1 : -1) : Math.sign(spot.x);
      const vx = side * (0.55 + hash(i + 1) * 1.3);
      const vy = 2.1 + hash(i + 2) * 2.1;
      const vz = -(1.1 + hash(i + 3) * 2);
      pin.position.set(spot.x + vx * tt, PIN_H / 2 + Math.max(0, vy * tt - 4.9 * tt * tt), spot.z + vz * tt);
      pin.rotation.set(-tt * (5 + hash(i + 4) * 9), tt * 3, side * tt * (4 + hash(i + 5) * 7));
    });
  });
  return (
    <group scale={mirror ? [1, -1, 1] : 1}>
      {PIN_SPOTS.map((spot, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} geometry={geometry} material={material} position={[spot.x, PIN_H / 2, spot.z]} castShadow={false} />
      ))}
    </group>
  );
}

export function ballPosition(p) {
  const roll = clamp01((p - ROLL_START) / (IMPACT - ROLL_START));
  const travel = roll * roll * (1.45 - 0.45 * roll); // quick off the hand, then steady
  const startZ = LANE_LEN - 1.4;
  const z = startZ + (0.05 - startZ) * travel;
  // Drifts out, then hooks back into the pocket.
  const x = Math.sin(travel * Math.PI) * 0.26 + travel * 0.06;
  const after = Math.max(0, p - IMPACT);
  return { x: x + after * 0.2, z: z - after * 9, travel, turned: travel * 46 };
}

function Ball({ progress, texture }) {
  const ball = useRef();
  const reflection = useRef();
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: texture, roughness: 0.14, metalness: 0.12 }), [texture]);
  useFrame(() => {
    const { x, z, turned } = ballPosition(progress.current);
    const gone = z < -1.25; // dropped into the pit behind the pins
    ball.current.visible = !gone;
    reflection.current.visible = !gone;
    ball.current.position.set(x, BALL_R, z);
    ball.current.rotation.set(-turned, 0, 0);
    reflection.current.position.set(x, -BALL_R, z);
    reflection.current.rotation.set(-turned, 0, 0);
  });
  return (
    <>
      <mesh ref={ball} material={material}><sphereGeometry args={[BALL_R, 48, 32]} /></mesh>
      <mesh ref={reflection} material={material} scale={[1, -1, 1]}><sphereGeometry args={[BALL_R, 32, 24]} /></mesh>
    </>
  );
}

function Lane() {
  const texture = useMemo(laneTexture, []);
  const midZ = LANE_LEN / 2 - 1.2;
  const length = LANE_LEN + 2.4;
  return (
    <group>
      {/* Slightly see-through, so the mirrored pins and ball read as a polished surface. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, midZ]}>
        <planeGeometry args={[LANE_W, length]} />
        <meshStandardMaterial map={texture} roughness={0.3} metalness={0.05} transparent opacity={0.8} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[side * (LANE_W / 2 + 0.12), -0.03, midZ]}>
            <planeGeometry args={[0.24, length]} />
            <meshStandardMaterial color="#0a0d1a" roughness={0.5} />
          </mesh>
          <mesh position={[side * (LANE_W / 2 + 0.25), 0.012, midZ]}>
            <boxGeometry args={[0.018, 0.018, length]} />
            <meshBasicMaterial color={side < 0 ? "#3f66ff" : "#ff2e45"} toneMapped={false} />
          </mesh>
          {/* Neighbouring lanes fading into the dark. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[side * (LANE_W + 0.5), -0.005, midZ]}>
            <planeGeometry args={[LANE_W, length]} />
            <meshStandardMaterial color="#6f5a3f" roughness={0.45} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Backdrop() {
  const texture = useMemo(() => {
    const loaded = new THREE.TextureLoader().load("/assets/opt/angkor.webp");
    loaded.colorSpace = THREE.SRGBColorSpace;
    return loaded;
  }, []);
  // Soft edges, so the temple glows out of the dark instead of sitting on a panel.
  const fade = useMemo(() => canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = "#000";
    c.fillRect(0, 0, w, h);
    const glow = c.createRadialGradient(w / 2, h * 0.72, 10, w / 2, h * 0.72, w * 0.5);
    glow.addColorStop(0, "#fff");
    glow.addColorStop(0.55, "#999");
    glow.addColorStop(1, "#000");
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);
  }), []);
  return (
    <mesh position={[0, 1.15, -1.7]}>
      <planeGeometry args={[5.4, 2.5]} />
      <meshBasicMaterial map={texture} alphaMap={fade} color={[1.25, 1.25, 1.25]} transparent toneMapped={false} blending={THREE.AdditiveBlending} fog={false} />
    </mesh>
  );
}

function Rig({ progress, target }) {
  const { camera, pointer, size } = useThree();
  const look = useRef(new THREE.Vector3(0, 0.1, 0));
  const narrow = size.width < size.height;
  useFrame((_, delta) => {
    // Damped so wheel steps and touch flicks land softly.
    progress.current = THREE.MathUtils.damp(progress.current, target.get(), 7, delta);
    const p = progress.current;
    const { x: ballX, z: ballZ } = ballPosition(p);
    const follow = ease(clamp01((p - 0.02) / 0.12));
    const settle = ease(clamp01((p - IMPACT) / 0.3));
    const backOff = narrow ? 2.7 : 1.9;
    const stopZ = narrow ? 3.1 : 2.4;
    const z = Math.max(ballZ + backOff, stopZ);
    const startX = narrow ? 0 : -0.24; // leave the headline room on wide screens
    const camX = THREE.MathUtils.lerp(startX, ballX * 0.55, follow) * (1 - settle);
    camera.position.set(
      camX + pointer.x * 0.05,
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.62, 0.34, follow), 0.62, settle) + pointer.y * 0.03,
      z,
    );
    look.current.set(camX * 0.4, THREE.MathUtils.lerp(narrow ? -0.2 : 0.14, 0.24, settle), z - 6);
    camera.lookAt(look.current);
  });
  return null;
}

function Scene({ target, mascot }) {
  useEnvironment();
  const progress = useRef(target.get());
  const texture = useMemo(() => ballTexture(mascot), [mascot]);
  const fill = useRef();
  useFrame(() => {
    const { x, z } = ballPosition(progress.current);
    fill.current.position.set(x, 0.5, z + 0.5);
  });
  return (
    <>
      <color attach="background" args={["#05070f"]} />
      <fog attach="fog" args={["#05070f", 16, 40]} />
      <ambientLight intensity={0.5} color="#b4c2ff" />
      <spotLight position={[0, 3, 1.4]} angle={0.7} penumbra={0.6} intensity={46} distance={9} color="#fff4e0" />
      <pointLight position={[0, 1.1, 3.4]} intensity={7} distance={7} color="#fff1dc" />
      <pointLight position={[0, 1.2, 12]} intensity={9} distance={11} color="#ffe9c8" />
      <pointLight position={[-1.6, 0.8, 6]} intensity={5} distance={9} color="#3f66ff" />
      <pointLight position={[1.6, 0.8, 6]} intensity={5} distance={9} color="#ff2e45" />
      <pointLight ref={fill} intensity={1.6} distance={4} color="#ffffff" />
      <Rig progress={progress} target={target} />
      <Lane />
      <Backdrop />
      <Pins progress={progress} />
      <Pins progress={progress} mirror />
      <Ball progress={progress} texture={texture} />
    </>
  );
}

export default function HeroScene({ progress, active, onReady }) {
  const mascotRef = useRef(null);
  const mascot = useMemo(() => {
    const img = new Image();
    img.src = "/assets/opt/mascot.webp";
    mascotRef.current = img;
    return img;
  }, []);
  const small = typeof window !== "undefined" && window.innerWidth < 760;
  return (
    <Canvas
      className="hero-canvas"
      dpr={[1, small ? 1.4 : 1.75]}
      frameloop={active ? "always" : "never"}
      camera={{ fov: small ? 44 : 34, near: 0.05, far: 40, position: [0, 0.6, 19] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        onReady?.();
      }}
    >
      <MascotGate image={mascot}>
        {(loaded) => <Scene target={progress} mascot={loaded} />}
      </MascotGate>
    </Canvas>
  );
}

// Draws the ball once the mascot image is in; without it the ball is simply plain.
function MascotGate({ image, children }) {
  const ready = useRef(image.complete ? image : null);
  const { invalidate } = useThree();
  useEffect(() => {
    if (ready.current) return undefined;
    const done = () => { ready.current = image; invalidate(); };
    image.addEventListener("load", done);
    return () => image.removeEventListener("load", done);
  }, [image, invalidate]);
  return children(image);
}
