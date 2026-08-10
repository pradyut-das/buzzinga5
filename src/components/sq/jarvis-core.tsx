"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { LiveState } from "@/hooks/use-gemini-live";

const STATE_COPY: Record<LiveState, { title: string; hint: string }> = {
  idle: { title: "Talk to Squirrl", hint: "Click to open voice" },
  connecting: { title: "Connecting", hint: "Opening voice channel" },
  listening: { title: "Listening", hint: "Go ahead, I’m with you" },
  thinking: { title: "Working", hint: "Reading your agency" },
  speaking: { title: "Answering", hint: "Squirrl is speaking" },
  error: { title: "Voice offline", hint: "Click to retry" },
};

/*
 * Adapted from the official Three.js MIT-licensed examples:
 * - examples/webgl_custom_attributes_points.html
 * - examples/webgl_points_waves.html
 *
 * The examples' BufferGeometry custom-attribute shader and sine-wave point
 * animation are reshaped into Squirrl's spherical, voice-reactive HUD. See
 * THIRD_PARTY_NOTICES.md for attribution and license text.
 */
const PARTICLE_VERTEX_SHADER = `
  attribute float size;
  attribute vec3 customColor;
  varying vec3 vColor;

  void main() {
    vColor = customColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (260.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PARTICLE_FRAGMENT_SHADER = `
  uniform vec3 color;
  varying vec3 vColor;

  void main() {
    if (length(gl_PointCoord - vec2(0.5)) > 0.46) discard;
    gl_FragColor = vec4(color * vColor, 0.94);
  }
`;

/**
 * The home microphone as a real Three.js scene: a shader-driven point cloud,
 * three orbital paths and a low-poly core. It is an assistant control first,
 * not decorative WebGL — the accessible HTML button remains above the canvas.
 */
export function JarvisCore({
  state,
  level,
  disabled,
  onToggle,
  activeTool,
}: {
  state: LiveState;
  level: number;
  disabled?: boolean;
  onToggle: () => void;
  activeTool?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const levelRef = useRef(level);
  const [webglFailed, setWebglFailed] = useState(false);
  const copy = STATE_COPY[state];

  stateRef.current = state;
  levelRef.current = level;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.z = 5.4;
    const assembly = new THREE.Group();
    scene.add(assembly);

    const particleCount = window.innerWidth < 700 ? 760 : 1400;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const particleSizes = new Float32Array(particleCount);
    const baseSizes = new Float32Array(particleCount);
    const vertex = new THREE.Vector3();
    const color = new THREE.Color();

    // Fibonacci distribution keeps the online example's custom attributes but
    // turns its random volume into a precise intelligence shell.
    for (let index = 0; index < particleCount; index += 1) {
      const y = 1 - (index / (particleCount - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = Math.PI * (3 - Math.sqrt(5)) * index;
      const shellRadius = 1.04 + 0.09 * Math.sin(index * 1.73);
      vertex.set(Math.cos(theta) * radius * 1.12, y * 1.12, Math.sin(theta) * radius * 1.12);
      vertex.multiplyScalar(shellRadius);
      vertex.toArray(particlePositions, index * 3);
      color.set(index % 13 === 0 ? 0xe8f4ff : 0x4eb4ff);
      color.toArray(particleColors, index * 3);
      baseSizes[index] = index % 17 === 0 ? 0.045 : 0.027;
      particleSizes[index] = baseSizes[index];
    }

    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    pointGeometry.setAttribute("customColor", new THREE.BufferAttribute(particleColors, 3));
    pointGeometry.setAttribute("size", new THREE.BufferAttribute(particleSizes, 1));
    const pointMaterial = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xffffff) } },
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const shell = new THREE.Points(pointGeometry, pointMaterial);
    assembly.add(shell);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x2997ff,
      transparent: true,
      opacity: 0.42,
      wireframe: true,
    });
    const rings = [1.42, 1.62, 1.83].map((radius, index) => {
      const geometry = new THREE.TorusGeometry(radius, 0.012, 4, 92);
      const ring = new THREE.Mesh(geometry, ringMaterial);
      ring.rotation.set(
        Math.PI * (0.18 + index * 0.21),
        Math.PI * (0.08 + index * 0.17),
        Math.PI * (index * 0.16),
      );
      assembly.add(ring);
      return ring;
    });

    const coreGeometry = new THREE.IcosahedronGeometry(0.5, 2);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xcfe9ff,
      wireframe: true,
      transparent: true,
      opacity: 0.72,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    assembly.add(core);

    const backgroundGeometry = new THREE.BufferGeometry();
    const backgroundCount = window.innerWidth < 700 ? 50 : 90;
    const positions = new Float32Array(backgroundCount * 3);
    for (let index = 0; index < backgroundCount; index += 1) {
      positions[index * 3] = ((index * 37) % 101) / 8 - 6.3;
      positions[index * 3 + 1] = ((index * 61) % 97) / 9 - 5.4;
      positions[index * 3 + 2] = -1 - ((index * 23) % 43) / 10;
    }
    backgroundGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const backgroundMaterial = new THREE.PointsMaterial({
      color: 0x2997ff,
      size: 0.025,
      transparent: true,
      opacity: 0.22,
      sizeAttenuation: true,
    });
    const depthField = new THREE.Points(backgroundGeometry, backgroundMaterial);
    scene.add(depthField);

    const pointer = new THREE.Vector2();
    let elapsed = 0;
    let previous = performance.now();

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      renderer.setSize(bounds.width, bounds.height, false);
      camera.aspect = bounds.width / bounds.height;
      camera.updateProjectionMatrix();
    };
    const handlePointer = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = (event.clientX - bounds.left) / bounds.width - 0.5;
      pointer.y = (event.clientY - bounds.top) / bounds.height - 0.5;
      if (reduceMotion.matches) paint(performance.now());
    };

    const paint = (time: number) => {
      const delta = Math.min((time - previous) / 1000, 0.05);
      previous = time;
      if (!reduceMotion.matches) elapsed += delta;
      const active = stateRef.current !== "idle";
      const audioEnergy = Math.min(levelRef.current, 1);
      const energy = active ? 1 + audioEnergy * 0.12 : 1;
      shell.rotation.y = elapsed * (active ? 0.28 : 0.1);
      shell.rotation.x = Math.sin(elapsed * 0.22) * 0.12;
      shell.scale.setScalar(energy);
      const sizeAttribute = pointGeometry.getAttribute("size");
      const sizes = sizeAttribute.array as Float32Array;
      for (let index = 0; index < particleCount; index += 1) {
        const travellingWave = Math.sin(index * 0.095 + elapsed * 3.2);
        const voicePulse = 1 + audioEnergy * (0.5 + 0.5 * travellingWave);
        sizes[index] = baseSizes[index] * (0.82 + 0.24 * travellingWave) * voicePulse;
      }
      sizeAttribute.needsUpdate = true;
      rings.forEach((ring, index) => {
        ring.rotation.z += delta * (0.08 + index * 0.035) * (active ? 2 : 1);
        ring.rotation.y += delta * (index % 2 ? -0.05 : 0.05);
      });
      core.rotation.x = elapsed * 0.18;
      core.rotation.y = elapsed * 0.24;
      core.scale.setScalar(1 + Math.sin(elapsed * 2.4) * (active ? 0.08 : 0.025));
      camera.position.x += (pointer.x * 0.42 - camera.position.x) * 0.035;
      camera.position.y += (-pointer.y * 0.28 - camera.position.y) * 0.035;
      camera.lookAt(0, 0, 0);
      depthField.rotation.z = elapsed * 0.008;
      renderer.render(scene, camera);
    };

    const handleMotionChange = () => {
      renderer.setAnimationLoop(null);
      if (reduceMotion.matches) {
        paint(performance.now());
      } else {
        previous = performance.now();
        renderer.setAnimationLoop(paint);
      }
    };

    resize();
    handleMotionChange();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointer, { passive: true });
    reduceMotion.addEventListener("change", handleMotionChange);

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointer);
      reduceMotion.removeEventListener("change", handleMotionChange);
      pointGeometry.dispose();
      pointMaterial.dispose();
      rings.forEach((ring) => ring.geometry.dispose());
      ringMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      backgroundGeometry.dispose();
      backgroundMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      className={`sq-jarvis${state === "idle" ? "" : " is-active"}${webglFailed ? " fallback" : ""}`}
    >
      {!webglFailed && <canvas ref={canvasRef} aria-hidden="true" />}
      {webglFailed && <span className="sq-jarvis-fallback" aria-hidden />}
      <button
        type="button"
        className="sq-jarvis-trigger"
        onClick={onToggle}
        disabled={disabled}
        aria-label={state === "idle" ? "Talk to Squirrl" : `Squirrl: ${copy.title}. Stop.`}
      >
        <b>{disabled ? "Voice offline" : copy.title}</b>
        <span>{disabled ? "Set GEMINI_API_KEY" : (activeTool ?? copy.hint)}</span>
      </button>
      <p role="status" className="sr-only">
        Squirrl {copy.title}. {activeTool ?? copy.hint}.
      </p>
    </div>
  );
}
