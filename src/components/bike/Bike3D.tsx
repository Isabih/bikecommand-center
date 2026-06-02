import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, ContactShadows, Environment } from "@react-three/drei";
import { Suspense, useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import type { BikeTelemetry, SystemMode } from "@/lib/bike-types";

export type CameraPreset = "front" | "angled" | "orbit";

interface Props {
  t: BikeTelemetry;
  mode: SystemMode;
  /** "panel" (default, fixed 340px) or "fill" (absolute inset, fills parent). */
  variant?: "panel" | "fill";
  /** Slow cinematic camera float (kiosk mode). */
  cinematic?: boolean;
  /** Hide HUD corner labels. */
  hideHud?: boolean;
  /** Camera preset (kiosk). Defaults to "angled". */
  cameraPreset?: CameraPreset;
}



// neon color palette aligned with the rest of the UI
const COL = {
  cyan: new THREE.Color("#7CE7FF"),
  green: new THREE.Color("#58F2A8"),
  red: new THREE.Color("#FF6B6B"),
  amber: new THREE.Color("#FFC061"),
  blue: new THREE.Color("#8AB4FF"),
  dim: new THREE.Color("#202836"),
} as const;

function Wheel({
  position,
  spinSpeed,
  brake,
}: {
  position: [number, number, number];
  spinSpeed: number;
  brake: boolean;
}) {
  const ref = useRef<THREE.Group>(null!);
  const currentSpeed = useRef(0);
  const rimMat = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(({ clock }, dt) => {
    // low-pass filter wheel angular velocity — smooth accel/decel
    const target = brake ? spinSpeed * 0.35 : spinSpeed;
    const alpha = 1 - Math.exp(-dt * (brake ? 6 : 2.5));
    currentSpeed.current += (target - currentSpeed.current) * alpha;
    if (ref.current) ref.current.rotation.x += currentSpeed.current * dt;
    if (rimMat.current) {
      const pulse = brake ? (Math.sin(clock.elapsedTime * 14) + 1) * 0.5 : 0;
      rimMat.current.emissiveIntensity = brake ? 1.4 + pulse * 1.4 : 0.4;
    }
  });
  return (
    <group position={position}>
      {/* tire */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.55, 0.16, 24, 64]} />
        <meshStandardMaterial color="#0d1219" roughness={0.9} metalness={0.15} />
      </mesh>
      {/* rim + spokes */}
      <group ref={ref}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.36, 0.04, 16, 48]} />
          <meshStandardMaterial
            ref={rimMat}
            color={brake ? "#ff7766" : "#8AB4FF"}
            emissive={brake ? COL.red : COL.blue}
            emissiveIntensity={brake ? 1.8 : 0.4}
            metalness={0.85}
            roughness={0.18}
            toneMapped={false}
          />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} rotation={[i * (Math.PI / 6), 0, 0]}>
            <boxGeometry args={[0.018, 0.7, 0.018]} />
            <meshStandardMaterial color="#b0bccc" metalness={0.75} roughness={0.3} />
          </mesh>
        ))}
        {/* hub */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.12, 16]} />
          <meshStandardMaterial color="#3a4252" metalness={0.9} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

function Indicator({
  position,
  active,
  color,
}: {
  position: [number, number, number];
  active: boolean;
  color: THREE.Color;
}) {
  const ref = useRef<THREE.MeshStandardMaterial>(null!);
  const lightRef = useRef<THREE.PointLight>(null!);
  const haloRef = useRef<THREE.MeshBasicMaterial>(null!);
  // square-wave blinker @ ~2.5Hz (real turn signal feel)
  useFrame(({ clock }) => {
    const phase = active ? (Math.sin(clock.elapsedTime * 8) > 0 ? 1 : 0) : 0;
    if (ref.current) ref.current.emissiveIntensity = active ? 0.4 + phase * 3.2 : 0.04;
    if (lightRef.current) lightRef.current.intensity = active ? phase * 2.6 : 0;
    if (haloRef.current) haloRef.current.opacity = active ? phase * 0.55 : 0;
  });
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial
          ref={ref}
          color={active ? color : "#2a3142"}
          emissive={color}
          emissiveIntensity={0.05}
          toneMapped={false}
        />
      </mesh>
      {/* soft halo billboard */}
      <mesh>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshBasicMaterial
          ref={haloRef}
          color={color}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <pointLight ref={lightRef} color={color} intensity={0} distance={1.6} decay={2} />
    </group>
  );
}

function LegSensor({
  position,
  active,
  side,
}: {
  position: [number, number, number];
  active: boolean;
  side: "L" | "R";
}) {
  const ref = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = active ? (Math.sin(clock.elapsedTime * 6) + 1) * 0.5 : 0;
    ref.current.emissiveIntensity = active ? 0.8 + pulse * 1.6 : 0.05;
  });
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.08, 0.12, 0.06, 16]} />
        <meshStandardMaterial
          ref={ref}
          color={active ? "#7CE7FF" : "#222a36"}
          emissive={COL.cyan}
          emissiveIntensity={0.05}
          toneMapped={false}
        />
      </mesh>
      <Html distanceFactor={6} position={[0, 0.18, 0]} center>
        <div
          className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded-sm border ${
            active
              ? "neon-text-cyan border-[oklch(0.85_0.18_200/0.6)] bg-[oklch(0.85_0.18_200/0.1)]"
              : "text-muted-foreground border-white/10 bg-black/40"
          }`}
        >
          {side}-LEG
        </div>
      </Html>
    </group>
  );
}

// Amber emissive panel on the bike body that blinks in sync with a turn signal.
function BodyBlinker({
  position,
  size,
  active,
}: {
  position: [number, number, number];
  size: [number, number, number];
  active: boolean;
}) {
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    const phase = active ? (Math.sin(clock.elapsedTime * 8) > 0 ? 1 : 0) : 0;
    mat.current.emissiveIntensity = active ? 0.15 + phase * 2.4 : 0.04;
  });
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        ref={mat}
        color="#3a2a10"
        emissive={COL.amber}
        emissiveIntensity={0.04}
        metalness={0.6}
        roughness={0.3}
        toneMapped={false}
      />
    </mesh>
  );
}

function BikeMesh({ t, mode }: Props) {
  const group = useRef<THREE.Group>(null!);
  // wheel rotation speed: km/h to rad/s, wheel radius ~0.55m
  const spinSpeed = useMemo(() => {
    const ms = (t.speed * 1000) / 3600;
    return ms / 0.55;
  }, [t.speed]);

  // Smoothed lean/pitch: lean forward proportional to speed, pitch up on brake.
  const speedNorm = useRef(0);
  const brakePulse = useRef(0);
  useFrame(({ clock }, dt) => {
    if (!group.current) return;
    const e = clock.elapsedTime;

    // low-pass speed normalization (0..1 over ~120 km/h)
    const targetN = Math.min(1, t.speed / 120);
    speedNorm.current += (targetN - speedNorm.current) * (1 - Math.exp(-dt * 3));

    // brake-flash pulse oscillator (used by tail light material)
    brakePulse.current = t.brake ? (Math.sin(e * 18) + 1) * 0.5 : 0;

    const leanForward = -speedNorm.current * 0.06;
    const brakePitch = t.brake ? 0.04 : 0;

    if (mode === "SIMULATION") {
      group.current.position.y = Math.sin(e * 2) * 0.08;
      group.current.rotation.z = Math.sin(e * 1.2) * 0.04 + leanForward + brakePitch;
    } else if (mode === "ACTIVE") {
      group.current.position.y = Math.sin(e * 6) * 0.015;
      group.current.rotation.z = leanForward + brakePitch;
    } else {
      group.current.position.y = 0;
      group.current.rotation.z = 0;
    }
  });

  const ignitionGlow = t.ignition ? 1.6 : 0.05;
  const brakeGlow = t.brake ? 2.6 : 0.05;

  return (
    <group ref={group} rotation={[0, -0.4, 0]}>
      {/* (real contact shadow rendered at Canvas level — no fake circle plane needed) */}

      {/* frame main beam */}
      <mesh position={[0, 0.05, 0]} rotation={[0, 0, -0.05]}>
        <boxGeometry args={[1.7, 0.12, 0.18]} />
        <meshStandardMaterial color="#1a2230" metalness={0.7} roughness={0.35} />
      </mesh>

      {/* fuel tank */}
      <mesh position={[0.05, 0.28, 0]}>
        <boxGeometry args={[0.7, 0.32, 0.36]} />
        <meshStandardMaterial
          color="#142033"
          emissive={t.ignition ? COL.green : COL.dim}
          emissiveIntensity={ignitionGlow * 0.25}
          metalness={0.8}
          roughness={0.25}
        />
      </mesh>

      {/* seat */}
      <mesh position={[-0.55, 0.28, 0]}>
        <boxGeometry args={[0.55, 0.1, 0.32]} />
        <meshStandardMaterial color="#0a0d14" roughness={0.95} />
      </mesh>

      {/* tail / brake light */}
      <mesh position={[-0.92, 0.32, 0]}>
        <boxGeometry args={[0.08, 0.14, 0.32]} />
        <meshStandardMaterial
          color={t.brake ? "#ff5050" : "#220a0a"}
          emissive={COL.red}
          emissiveIntensity={brakeGlow}
          toneMapped={false}
        />
      </mesh>
      {t.brake && (
        <pointLight position={[-1.15, 0.32, 0]} color="#ff3030" intensity={3.5} distance={2.5} />
      )}

      {/* body-mounted turn-signal panels — emissive amber strips along the fairing */}
      {/* front tank flanks */}
      <BodyBlinker position={[0.18, 0.28, 0.185]} size={[0.42, 0.08, 0.02]} active={t.right_indicator} />
      <BodyBlinker position={[0.18, 0.28, -0.185]} size={[0.42, 0.08, 0.02]} active={t.left_indicator} />
      {/* tail flanks */}
      <BodyBlinker position={[-0.78, 0.3, 0.17]} size={[0.28, 0.06, 0.02]} active={t.right_indicator} />
      <BodyBlinker position={[-0.78, 0.3, -0.17]} size={[0.28, 0.06, 0.02]} active={t.left_indicator} />


      {/* handlebars */}
      <mesh position={[0.78, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.55, 12]} />
        <meshStandardMaterial color="#9aa6b8" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* headlight + ignition core */}
      <mesh position={[0.95, 0.42, 0]}>
        <sphereGeometry args={[0.13, 24, 24]} />
        <meshStandardMaterial
          color={t.ignition ? "#fff5d6" : "#1a1f28"}
          emissive={t.ignition ? new THREE.Color("#fff0c0") : COL.dim}
          emissiveIntensity={ignitionGlow}
          toneMapped={false}
        />
      </mesh>
      {t.ignition && (
        <>
          <pointLight position={[1.1, 0.42, 0]} color="#fff0c0" intensity={2.4} distance={3.5} />
          {/* headlight beam cone */}
          <spotLight
            position={[1.0, 0.42, 0]}
            target-position={[3.5, 0.0, 0]}
            angle={0.45}
            penumbra={0.7}
            intensity={3.2}
            distance={5}
            color="#fff4cc"
            castShadow={false}
          />
          {/* dashboard / cluster glow panel above tank */}
          <mesh position={[0.5, 0.52, 0]} rotation={[-0.35, 0, 0]}>
            <boxGeometry args={[0.24, 0.02, 0.22]} />
            <meshStandardMaterial
              color="#0a1a2a"
              emissive={COL.cyan}
              emissiveIntensity={1.6}
              toneMapped={false}
            />
          </mesh>
        </>
      )}


      {/* fork */}
      <mesh position={[0.78, 0.0, 0]} rotation={[0, 0, 0.25]}>
        <cylinderGeometry args={[0.04, 0.04, 0.8, 12]} />
        <meshStandardMaterial color="#9aa6b8" metalness={0.85} roughness={0.2} />
      </mesh>
      {/* swing arm */}
      <mesh position={[-0.78, -0.18, 0]} rotation={[0, 0, -0.1]}>
        <boxGeometry args={[0.6, 0.08, 0.1]} />
        <meshStandardMaterial color="#1a2230" metalness={0.7} roughness={0.35} />
      </mesh>

      {/* exhaust */}
      <mesh position={[-0.55, -0.15, 0.18]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.07, 0.6, 16]} />
        <meshStandardMaterial color="#c7cdd6" metalness={0.95} roughness={0.15} />
      </mesh>

      {/* wheels */}
      <Wheel position={[0.85, -0.35, 0]} spinSpeed={spinSpeed} brake={t.brake} />
      <Wheel position={[-0.85, -0.35, 0]} spinSpeed={spinSpeed} brake={t.brake} />

      {/* indicators */}
      <Indicator position={[0.95, 0.55, 0.22]} active={t.right_indicator} color={COL.amber} />
      <Indicator position={[0.95, 0.55, -0.22]} active={t.left_indicator} color={COL.amber} />
      <Indicator position={[-0.92, 0.45, 0.18]} active={t.right_indicator} color={COL.amber} />
      <Indicator position={[-0.92, 0.45, -0.18]} active={t.left_indicator} color={COL.amber} />

      {/* leg sensors (foot pegs) */}
      <LegSensor position={[-0.05, -0.32, 0.32]} active={t.right_leg} side="R" />
      <LegSensor position={[-0.05, -0.32, -0.32]} active={t.left_leg} side="L" />

      {/* heartbeat strip on tank */}
      <mesh position={[0.05, 0.46, 0]}>
        <boxGeometry args={[0.5, 0.02, 0.05]} />
        <meshStandardMaterial
          color={t.heartbeat ? "#ff4060" : "#1a1820"}
          emissive={COL.red}
          emissiveIntensity={t.heartbeat ? 1.4 : 0.05}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function ModeBackdrop({ mode }: { mode: SystemMode }) {
  const color =
    mode === "ACTIVE" ? "#58F2A8" : mode === "SIMULATION" ? "#8AB4FF" : "#2a3142";
  return (
    <>
      <fog attach="fog" args={[mode === "IDLE" ? "#0a0e16" : "#08101a", 5, 12]} />
      <pointLight position={[0, -1, 0]} color={color} intensity={mode === "IDLE" ? 0.3 : 1.6} distance={6} />
    </>
  );
}

function CameraFloat({ enabled }: { enabled: boolean }) {
  useFrame(({ camera, clock }) => {
    if (!enabled) return;
    const e = clock.elapsedTime;
    camera.position.y = 1.4 + Math.sin(e * 0.4) * 0.08;
    camera.position.x = 2.4 + Math.sin(e * 0.25) * 0.12;
    camera.lookAt(0, 0.2, 0);
  });
  return null;
}

export function Bike3D({ t, mode, variant = "panel", cinematic = false, hideHud = false }: Props) {
  const wrap =
    variant === "fill"
      ? "absolute inset-0 overflow-hidden bg-[oklch(0.12_0.02_252)]"
      : "relative h-[340px] w-full rounded-xl overflow-hidden border border-white/10 bg-[oklch(0.16_0.03_252)]";
  return (
    <div className={wrap}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [2.4, 1.4, 3.2], fov: cinematic ? 34 : 38 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <color attach="background" args={[cinematic ? "#050810" : "#070b13"]} />
        <ModeBackdrop mode={mode} />
        <ambientLight intensity={cinematic ? 0.65 : 0.5} />
        <directionalLight position={[4, 6, 3]} intensity={1.4} castShadow shadow-mapSize={[2048, 2048]} />
        <directionalLight position={[-4, 2, -3]} intensity={0.55} color="#8AB4FF" />
        <directionalLight position={[0, 4, -4]} intensity={0.35} color="#7CE7FF" />
        <Suspense fallback={null}>
          <Environment preset="city" />
          <BikeMesh t={t} mode={mode} />
          <ContactShadows
            position={[0, -0.72, 0]}
            opacity={0.6}
            scale={7}
            blur={2.8}
            far={2}
            resolution={1024}
            color="#000000"
          />
        </Suspense>
        <CameraFloat enabled={cinematic} />
        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={2.6}
          maxDistance={6.5}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.05}
          autoRotate={cinematic || mode !== "IDLE"}
          autoRotateSpeed={cinematic ? 0.6 : mode === "SIMULATION" ? 1.2 : 0.4}
        />
      </Canvas>

      {!hideHud && (
        <div className="pointer-events-none absolute inset-0 p-3 flex flex-col justify-between">
          <div className="flex justify-between text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            <span className="neon-text-cyan">3D KIOSK</span>
            <span>
              {mode === "ACTIVE" ? "LIVE RIDE" : mode === "SIMULATION" ? "SIMULATING" : "STANDBY"}
            </span>
          </div>
          <div className="flex justify-between text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            <span>SPD {t.speed.toFixed(1)} km/h</span>
            <span>{t.esp32_id}</span>
          </div>
        </div>
      )}

      {mode === "IDLE" && !cinematic && (
        <div className="pointer-events-none absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
          <div className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground border border-white/10 px-4 py-2 rounded-full bg-black/40">
            Session idle — start to bring sensors live
          </div>
        </div>
      )}
    </div>
  );
}

