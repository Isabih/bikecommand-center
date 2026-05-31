import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, ContactShadows, Environment } from "@react-three/drei";
import { Suspense, useRef, useMemo } from "react";
import * as THREE from "three";
import type { BikeTelemetry, SystemMode } from "@/lib/bike-types";

interface Props {
  t: BikeTelemetry;
  mode: SystemMode;
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
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.x += spinSpeed * dt;
  });
  return (
    <group position={position}>
      {/* tire */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.55, 0.16, 16, 48]} />
        <meshStandardMaterial color="#0d1219" roughness={0.85} metalness={0.2} />
      </mesh>
      {/* rim + spokes */}
      <group ref={ref}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.36, 0.04, 12, 32]} />
          <meshStandardMaterial
            color={brake ? "#ff5555" : "#8AB4FF"}
            emissive={brake ? COL.red : COL.blue}
            emissiveIntensity={brake ? 1.8 : 0.4}
            metalness={0.7}
            roughness={0.25}
          />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[i * (Math.PI / 4), 0, 0]}>
            <boxGeometry args={[0.02, 0.7, 0.02]} />
            <meshStandardMaterial color="#9aa6b8" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
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
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = active ? (Math.sin(clock.elapsedTime * 8) + 1) * 0.5 : 0;
    ref.current.emissiveIntensity = active ? 0.6 + t * 2.2 : 0.05;
  });
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.09, 16, 16]} />
      <meshStandardMaterial
        ref={ref}
        color={active ? color : "#2a3142"}
        emissive={color}
        emissiveIntensity={0.05}
        toneMapped={false}
      />
    </mesh>
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

function BikeMesh({ t, mode }: Props) {
  const group = useRef<THREE.Group>(null!);
  // wheel rotation speed: km/h to rad/s, wheel radius ~0.55m
  const spinSpeed = useMemo(() => {
    const ms = (t.speed * 1000) / 3600;
    return ms / 0.55;
  }, [t.speed]);

  // subtle idle wobble in IDLE; sim mode has dramatic float; active rides smoother
  useFrame(({ clock }) => {
    if (!group.current) return;
    const e = clock.elapsedTime;
    if (mode === "SIMULATION") {
      group.current.position.y = Math.sin(e * 2) * 0.08;
      group.current.rotation.z = Math.sin(e * 1.2) * 0.04;
    } else if (mode === "ACTIVE") {
      group.current.position.y = Math.sin(e * 6) * 0.015;
      group.current.rotation.z = 0;
    } else {
      group.current.position.y = 0;
      group.current.rotation.z = 0;
    }
  });

  const ignitionGlow = t.ignition ? 1.6 : 0.05;
  const brakeGlow = t.brake ? 2.2 : 0.05;

  return (
    <group ref={group} rotation={[0, -0.4, 0]}>
      {/* shadow plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.72, 0]} receiveShadow>
        <circleGeometry args={[2.5, 48]} />
        <meshBasicMaterial color="#000" transparent opacity={0.35} />
      </mesh>

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
        <boxGeometry args={[0.08, 0.12, 0.28]} />
        <meshStandardMaterial
          color={t.brake ? "#ff4040" : "#220a0a"}
          emissive={COL.red}
          emissiveIntensity={brakeGlow}
          toneMapped={false}
        />
      </mesh>

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
      {t.ignition && <pointLight position={[1.1, 0.42, 0]} color="#fff0c0" intensity={2} distance={3} />}

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

export function Bike3D({ t, mode }: Props) {
  return (
    <div className="relative h-[340px] w-full rounded-xl overflow-hidden border border-white/10 bg-[oklch(0.16_0.03_252)]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [2.4, 1.4, 3.2], fov: 38 }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#070b13"]} />
        <ModeBackdrop mode={mode} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 3]} intensity={0.8} castShadow />
        <directionalLight position={[-4, 2, -3]} intensity={0.3} color="#8AB4FF" />
        <Suspense fallback={null}>
          <BikeMesh t={t} mode={mode} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={2.8}
          maxDistance={6}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.05}
          autoRotate={mode !== "IDLE"}
          autoRotateSpeed={mode === "SIMULATION" ? 1.2 : 0.4}
        />
      </Canvas>

      {/* HUD overlay corners */}
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

      {mode === "IDLE" && (
        <div className="pointer-events-none absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
          <div className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground border border-white/10 px-4 py-2 rounded-full bg-black/40">
            Session idle — start to bring sensors live
          </div>
        </div>
      )}
    </div>
  );
}
