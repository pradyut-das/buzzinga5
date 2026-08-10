"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useGeminiLive, type LiveState } from "@/hooks/use-gemini-live";

const FREQ_BIN_COUNT = 1024;

const STATUS_COPY: Record<LiveState, string> = {
  idle: "SCANNER STANDBY · CLICK FRAME TO TALK",
  connecting: "CONNECTING TO GEMINI LIVE",
  listening: "LISTENING · TALK TO ME",
  thinking: "PROCESSING · READING YOUR AGENCY",
  speaking: "ANSWERING · SIGNAL LOCKED",
  error: "VOICE LINK LOST · CLICK TO RETRY",
};

/**
 * The anomaly scanner, ported verbatim from the assistant scene, bound to the
 * Gemini Live voice session that already powers the homepage orb. The control
 * panel and every overlay panel are hidden — the scanner frame is the
 * microphone, and the anomaly, circular visualizer, audio wave and spectrum
 * all react to the live microphone / speaker level.
 */
export function AssistantScanner({ agentEnabled }: { agentEnabled: boolean }) {
  const router = useRouter();
  const scopeRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<() => void>(() => {});

  const live = useGeminiLive({ onMutation: () => router.refresh() });
  const liveRef = useRef(live);
  liveRef.current = live;

  const agentEnabledRef = useRef(agentEnabled);
  agentEnabledRef.current = agentEnabled;

  useEffect(() => {
    const scope = scopeRef.current!;

    // Audio analysis state. No local audio plays on this page — the levels
    // come from the Gemini Live session, so the analyser stays untouched and
    // a synthetic spectrum shaped by the live level drives the visuals.
    let audioContext: AudioContext | null = null;
    let audioAnalyser: AnalyserNode | null = null;
    let audioSource: MediaElementAudioSourceNode | null = null;
    let audioData = new Uint8Array(FREQ_BIN_COUNT);
    let frequencyData = new Uint8Array(FREQ_BIN_COUNT);
    let audioReactivity = 1.0;
    let audioSensitivity = 5.0;
    let smoothedLevel = 0;
    let isAudioInitialized = false;
    let lastUserActionTime = Date.now();
    let updateGlow: ((time: number, audioLevel: number) => void) | null = null;
    let updateParticles: ((time: number) => void) | null = null;
    let crypticMessageTimeout: ReturnType<typeof setTimeout> | null = null;
    let audioContextStarted = false;
    let audioSourceConnected = false;
    let currentAudioElement: HTMLAudioElement | null = null;
    let floatingParticles: Array<{
      element: HTMLDivElement;
      x: number;
      y: number;
      speed: number;
      angle: number;
      angleSpeed: number;
      amplitude: number;
      size: number;
      pulseSpeed: number;
      pulsePhase: number;
    }> = [];
    let currentMessageIndex = 0;
    let disposed = false;

    const rafIds: number[] = [];
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];

    const schedule = (cb: FrameRequestCallback) => {
      const id = requestAnimationFrame(cb);
      rafIds.push(id);
      return id;
    };

    const setTimeoutSafe = (cb: () => void, ms: number) => {
      const id = setTimeout(cb, ms);
      timeouts.push(id);
      return id;
    };

    const setIntervalSafe = (cb: () => void, ms: number) => {
      const id = setInterval(cb, ms);
      intervals.push(id);
      return id;
    };

    function getLiveLevel() {
      const current = liveRef.current;
      if (current.state === "speaking") return current.outputLevel;
      if (current.state === "listening") return current.inputLevel;
      if (current.state === "thinking") return 0.35;
      return 0;
    }

    function showNotification(message: string) {
      const notification = scope.querySelector<HTMLElement>("#notification");
      if (!notification) return;
      notification.textContent = message;
      notification.style.opacity = "1";
      setTimeoutSafe(() => {
        notification.style.opacity = "0";
      }, 3000);
    }

    function addTerminalMessage(message: string, isCommand = false) {
      const terminalContent = scope.querySelector<HTMLElement>("#terminal-content");
      const typingLine = terminalContent?.querySelector<HTMLElement>(".typing");
      if (!terminalContent || !typingLine) return;
      const newLine = document.createElement("div");
      newLine.className = isCommand ? "terminal-line command-line" : "terminal-line";
      newLine.textContent = message;
      terminalContent.insertBefore(newLine, typingLine);
      terminalContent.scrollTop = terminalContent.scrollHeight;
    }

    function updateHeaderStatus() {
      const statusElement = scope.querySelector<HTMLElement>(".header .header-item");
      if (!statusElement) return;
      statusElement.textContent = STATUS_COPY[liveRef.current.state];
    }

    // The scanner frame is only part of the scene while a tool is being
    // processed; otherwise it stays faded out so the sphere reads cleanly.
    function updateScannerFrame() {
      const frame = scope.querySelector<HTMLElement>(".scanner-frame");
      if (!frame) return;
      frame.classList.toggle("scanner-frame-active", liveRef.current.state === "thinking");
    }

    function toggleVoice() {
      const current = liveRef.current;
      if (!agentEnabledRef.current) {
        showNotification("AGENT OFFLINE · SET GEMINI_API_KEY TO ENABLE");
        return;
      }
      if (current.isLive) {
        current.stop();
        zoomCameraForAudio(false);
        showNotification("VOICE SESSION CLOSED");
      } else {
        void current.start();
        zoomCameraForAudio(true);
      }
    }
    toggleRef.current = toggleVoice;

    setupExpandingCirclesPreloader();

    function setupExpandingCirclesPreloader() {
      const canvas = scope.querySelector<HTMLCanvasElement>("#preloader-canvas")!;
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      let time = 0;
      let lastTime = 0;
      const maxRadius = 80;
      const circleCount = 5;
      const dotCount = 24;

      function animate(timestamp: number) {
        if (disposed) return;
        if (!lastTime) lastTime = timestamp;
        const deltaTime = timestamp - lastTime;
        lastTime = timestamp;
        time += deltaTime * 0.001;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 78, 66, 0.9)";
        ctx.fill();
        for (let c = 0; c < circleCount; c++) {
          const circlePhase = (time * 0.3 + c / circleCount) % 1;
          const radius = circlePhase * maxRadius;
          const opacity = 1 - circlePhase;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 78, 66, ${opacity * 0.2})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          for (let i = 0; i < dotCount; i++) {
            const angle = (i / dotCount) * Math.PI * 2;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            const size = 2 * (1 - circlePhase * 0.5);
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(x, y);
            ctx.strokeStyle = `rgba(255, 78, 66, ${opacity * 0.1})`;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 78, 66, ${opacity * 0.9})`;
            ctx.fill();
          }
        }
        const overlay = scope.querySelector<HTMLElement>("#loading-overlay");
        if (overlay && overlay.style.display !== "none") {
          schedule(animate);
        }
      }
      schedule(animate);
    }

    function initFloatingParticles() {
      const container = scope.querySelector<HTMLElement>("#floating-particles");
      if (!container) return;
      const numParticles = 1000;

      container.innerHTML = "";
      floatingParticles = [];

      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const centerX = windowWidth / 2;
      const centerY = windowHeight / 2;

      for (let i = 0; i < numParticles; i++) {
        const particle = document.createElement("div");
        particle.className = "particle";
        particle.style.position = "absolute";

        particle.style.width = "1.5px";
        particle.style.height = "1.5px";
        particle.style.backgroundColor = `rgba(255, ${
          Math.floor(Math.random() * 100) + 78
        }, ${Math.floor(Math.random() * 100) + 66}, ${Math.random() * 0.5 + 0.2})`;
        particle.style.borderRadius = "50%";

        const minDistance = 200;
        const maxDistance = Math.max(windowWidth, windowHeight) * 0.8;

        const angle = Math.random() * Math.PI * 2;

        const distanceFactor = Math.sqrt(Math.random());
        const distance = minDistance + distanceFactor * (maxDistance - minDistance);

        const x = Math.cos(angle) * distance + centerX;
        const y = Math.sin(angle) * distance + centerY;

        particle.style.left = x + "px";
        particle.style.top = y + "px";

        const particleObj = {
          element: particle,
          x,
          y,
          speed: Math.random() * 0.5 + 0.1,
          angle: Math.random() * Math.PI * 2,
          angleSpeed: (Math.random() - 0.5) * 0.02,
          amplitude: Math.random() * 50 + 20,
          size: 1.5,
          pulseSpeed: Math.random() * 0.04 + 0.01,
          pulsePhase: Math.random() * Math.PI * 2,
        };

        floatingParticles.push(particleObj);
        container.appendChild(particle);
      }

      animateFloatingParticles();
    }

    function animateFloatingParticles() {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      let time = 0;

      function updateParticlesFrame() {
        if (disposed) return;
        time += 0.01;

        floatingParticles.forEach((particle) => {
          particle.angle += particle.angleSpeed;

          const orbitX = centerX + Math.cos(particle.angle) * particle.amplitude;
          const orbitY = centerY + Math.sin(particle.angle) * particle.amplitude;

          const noiseX = Math.sin(time * particle.speed + particle.angle) * 5;
          const noiseY = Math.cos(time * particle.speed + particle.angle * 0.7) * 5;

          const newX = orbitX + noiseX;
          const newY = orbitY + noiseY;

          particle.element.style.left = newX + "px";
          particle.element.style.top = newY + "px";

          const pulseFactor = 1 + Math.sin(time * particle.pulseSpeed + particle.pulsePhase) * 0.3;
          const newSize = particle.size * pulseFactor;

          particle.element.style.width = newSize + "px";
          particle.element.style.height = newSize + "px";

          const baseOpacity =
            0.2 + Math.sin(time * particle.pulseSpeed + particle.pulsePhase) * 0.1;
          particle.element.style.opacity = String(Math.min(0.8, baseOpacity));
        });

        schedule(updateParticlesFrame);
      }

      schedule(updateParticlesFrame);
    }

    function initAudio() {
      if (isAudioInitialized) return true;
      try {
        const AudioContextCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContext = new AudioContextCtor();
        audioAnalyser = audioContext.createAnalyser();
        audioAnalyser.fftSize = 2048;
        audioAnalyser.smoothingTimeConstant = 0.8;
        audioData = new Uint8Array(audioAnalyser.frequencyBinCount);
        frequencyData = new Uint8Array(audioAnalyser.frequencyBinCount);
        audioAnalyser.connect(audioContext.destination);
        isAudioInitialized = true;
        addTerminalMessage("AUDIO ANALYSIS SYSTEM INITIALIZED.");
        showNotification("AUDIO ANALYSIS SYSTEM ONLINE");
        return true;
      } catch (error) {
        console.error("Audio initialization error:", error);
        addTerminalMessage("ERROR: AUDIO SYSTEM INITIALIZATION FAILED.");
        showNotification("AUDIO SYSTEM ERROR");
        return false;
      }
    }

    function ensureAudioContextStarted() {
      if (!audioContext) {
        if (!initAudio()) return false;
      }
      const context = audioContext;
      if (!context) return false;
      if (context.state === "suspended") {
        context
          .resume()
          .then(() => {
            if (!audioContextStarted) {
              audioContextStarted = true;
              addTerminalMessage("AUDIO CONTEXT RESUMED.");
            }
          })
          .catch((err) => {
            console.error("Failed to resume audio context:", err);
            addTerminalMessage("ERROR: FAILED TO RESUME AUDIO CONTEXT.");
          });
      } else {
        audioContextStarted = true;
      }
      return true;
    }

    function cleanupAudioSource() {
      if (audioSource) {
        try {
          audioSource.disconnect();
          audioSourceConnected = false;
          audioSource = null;
        } catch (e) {
          console.log("Error disconnecting previous source:", e);
        }
      }
    }

    function createNewAudioElement() {
      if (currentAudioElement) {
        if (currentAudioElement.parentNode) {
          currentAudioElement.parentNode.removeChild(currentAudioElement);
        }
      }
      const newAudioElement = document.createElement("audio");
      newAudioElement.id = "audio-player";
      newAudioElement.className = "audio-player";
      newAudioElement.crossOrigin = "anonymous";
      scope
        .querySelector(".audio-controls")
        ?.insertBefore(newAudioElement, scope.querySelector(".controls-row"));
      currentAudioElement = newAudioElement;
      return newAudioElement;
    }

    function setupAudioSource(audioElement: HTMLAudioElement) {
      try {
        if (!ensureAudioContextStarted()) {
          addTerminalMessage("ERROR: AUDIO CONTEXT NOT AVAILABLE. CLICK ANYWHERE TO ENABLE AUDIO.");
          return false;
        }
        cleanupAudioSource();
        try {
          if (!audioSourceConnected) {
            audioSource = audioContext!.createMediaElementSource(audioElement);
            audioSource.connect(audioAnalyser!);
            audioSourceConnected = true;
          }
          return true;
        } catch (error) {
          console.error("Error creating media element source:", error);
          if (
            error instanceof Error &&
            error.name === "InvalidStateError" &&
            error.message.includes("already connected")
          ) {
            addTerminalMessage("AUDIO SOURCE ALREADY CONNECTED. ATTEMPTING TO PLAY ANYWAY.");
            return true;
          }
          addTerminalMessage(
            "ERROR: FAILED TO SETUP AUDIO SOURCE. " +
              (error instanceof Error ? error.message : String(error)),
          );
          return false;
        }
      } catch (error) {
        console.error("Error setting up audio source:", error);
        addTerminalMessage("ERROR: FAILED TO SETUP AUDIO SOURCE.");
        return false;
      }
    }

    function initAudioFile(file: File) {
      try {
        if (!isAudioInitialized && !initAudio()) {
          return;
        }
        const audioPlayer = createNewAudioElement();
        const fileURL = URL.createObjectURL(file);
        audioPlayer.src = fileURL;
        audioPlayer.onloadeddata = function () {
          if (setupAudioSource(audioPlayer)) {
            audioPlayer
              .play()
              .then(() => {
                zoomCameraForAudio(true);
              })
              .catch((e) => {
                console.warn("Auto-play prevented:", e);
                addTerminalMessage(
                  "WARNING: AUTO-PLAY PREVENTED BY BROWSER. CLICK PLAY TO START AUDIO.",
                );
              });
          }
        };
        const label = scope.querySelector("#file-label");
        if (label) label.textContent = file.name;
        scope.querySelectorAll(".demo-track-btn").forEach((btn) => {
          btn.classList.remove("active");
        });
        addTerminalMessage(`AUDIO FILE LOADED: ${file.name}`);
        showNotification("AUDIO FILE LOADED");
      } catch (error) {
        console.error("Audio file error:", error);
        addTerminalMessage("ERROR: AUDIO FILE PROCESSING FAILED.");
        showNotification("AUDIO FILE ERROR");
      }
    }

    function loadAudioFromURL(url: string) {
      try {
        if (!isAudioInitialized && !initAudio()) {
          return;
        }
        ensureAudioContextStarted();
        const audioPlayer = createNewAudioElement();
        audioPlayer.src = url;
        audioPlayer.onloadeddata = function () {
          if (setupAudioSource(audioPlayer)) {
            audioPlayer
              .play()
              .then(() => {
                zoomCameraForAudio(true);
                addTerminalMessage(`PLAYING DEMO TRACK: ${url.split("/").pop()}`);
                showNotification(`PLAYING: ${url.split("/").pop()}`);
              })
              .catch((e) => {
                console.warn("Play prevented:", e);
                addTerminalMessage(
                  "WARNING: AUDIO PLAYBACK PREVENTED BY BROWSER. CLICK PLAY TO START AUDIO.",
                );
                showNotification("CLICK PLAY TO START AUDIO");
              });
          }
        };
        const filename = url.split("/").pop();
        const label = scope.querySelector("#file-label");
        if (label && filename) label.textContent = filename;
        addTerminalMessage(`LOADING AUDIO FROM URL: ${url.substring(0, 40)}...`);
        showNotification("AUDIO URL LOADED");
      } catch (error) {
        console.error("Audio URL error:", error);
        addTerminalMessage("ERROR: AUDIO URL PROCESSING FAILED.");
        showNotification("AUDIO URL ERROR");
      }
    }

    const circularCanvas = scope.querySelector<HTMLCanvasElement>("#circular-canvas");
    const circularCtx = circularCanvas?.getContext("2d") ?? null;

    function resizeCircularCanvas() {
      if (!circularCanvas) return;
      circularCanvas.width = circularCanvas.offsetWidth;
      circularCanvas.height = circularCanvas.offsetHeight;
    }
    resizeCircularCanvas();

    function synthesizeAudioData(level: number, time: number) {
      // No Math.random() here: layered, slowly-evolving sines keep the whole
      // visualisation smooth from frame to frame while still feeling alive.
      for (let i = 0; i < frequencyData.length; i++) {
        const t = i / frequencyData.length;
        const idle =
          Math.abs(Math.sin(i * 0.18 + time * 1.5) * 18) +
          Math.abs(Math.sin(i * 0.05 - time * 2.5) * 14);
        const voiceAmplitude =
          70 +
          130 * (0.5 + 0.5 * Math.sin(time * 1.7 + i * 0.015)) * (0.5 + 0.5 * Math.sin(time * 0.9));
        const voice =
          level * voiceAmplitude * Math.max(0, Math.sin(Math.PI * (0.15 + t * 0.9 + level * 0.4)));
        frequencyData[i] = Math.min(255, Math.round(idle + voice));
      }
      for (let i = 0; i < audioData.length; i++) {
        const t = i / audioData.length;
        const idle =
          Math.sin(t * Math.PI * 3 + time * 1.6) * 8 + Math.sin(t * Math.PI * 8 - time * 2.2) * 5;
        const voice = level * Math.sin(t * Math.PI * 2 + time * 3) * 55;
        audioData[i] = Math.round(Math.min(255, Math.max(0, 128 + idle + voice)));
      }
    }

    function drawCircularVisualizer() {
      if (!circularCtx || !circularCanvas || !frequencyData) return;
      const width = circularCanvas.width;
      const height = circularCanvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      circularCtx.clearRect(0, 0, width, height);
      const numPoints = 180;
      const baseRadius = Math.min(width, height) * 0.4;
      circularCtx.beginPath();
      circularCtx.arc(centerX, centerY, baseRadius * 1.2, 0, Math.PI * 2);
      circularCtx.fillStyle = "rgba(255, 78, 66, 0.05)";
      circularCtx.fill();
      const numRings = 3;
      for (let ring = 0; ring < numRings; ring++) {
        const ringRadius = baseRadius * (0.7 + ring * 0.15);
        const opacity = 0.8 - ring * 0.2;
        circularCtx.beginPath();
        for (let i = 0; i < numPoints; i++) {
          const freqRangeStart = Math.floor((ring * frequencyData.length) / (numRings * 1.5));
          const freqRangeEnd = Math.floor(((ring + 1) * frequencyData.length) / (numRings * 1.5));
          const freqRange = freqRangeEnd - freqRangeStart;
          let sum = 0;
          const segmentSize = Math.floor(freqRange / numPoints);
          for (let j = 0; j < segmentSize; j++) {
            const freqIndex = freqRangeStart + ((i * segmentSize + j) % freqRange);
            sum += frequencyData[freqIndex];
          }
          const value = sum / (segmentSize * 255);
          const adjustedValue = value * (audioSensitivity / 5) * audioReactivity;
          const dynamicRadius = ringRadius * (1 + adjustedValue * 0.5);
          const angle = (i / numPoints) * Math.PI * 2;
          const x = centerX + Math.cos(angle) * dynamicRadius;
          const y = centerY + Math.sin(angle) * dynamicRadius;
          if (i === 0) {
            circularCtx.moveTo(x, y);
          } else {
            circularCtx.lineTo(x, y);
          }
        }
        circularCtx.closePath();
        let gradient;
        if (ring === 0) {
          gradient = circularCtx.createRadialGradient(
            centerX,
            centerY,
            ringRadius * 0.8,
            centerX,
            centerY,
            ringRadius * 1.2,
          );
          gradient.addColorStop(0, `rgba(255, 78, 66, ${opacity})`);
          gradient.addColorStop(1, `rgba(194, 54, 47, ${opacity * 0.7})`);
        } else if (ring === 1) {
          gradient = circularCtx.createRadialGradient(
            centerX,
            centerY,
            ringRadius * 0.8,
            centerX,
            centerY,
            ringRadius * 1.2,
          );
          gradient.addColorStop(0, `rgba(194, 54, 47, ${opacity})`);
          gradient.addColorStop(1, `rgba(255, 179, 171, ${opacity * 0.7})`);
        } else {
          gradient = circularCtx.createRadialGradient(
            centerX,
            centerY,
            ringRadius * 0.8,
            centerX,
            centerY,
            ringRadius * 1.2,
          );
          gradient.addColorStop(0, `rgba(255, 179, 171, ${opacity})`);
          gradient.addColorStop(1, `rgba(255, 78, 66, ${opacity * 0.7})`);
        }
        circularCtx.strokeStyle = gradient;
        circularCtx.lineWidth = 2 + (numRings - ring);
        circularCtx.stroke();
        circularCtx.shadowBlur = 15;
        circularCtx.shadowColor = "rgba(255, 78, 66, 0.7)";
      }
      circularCtx.shadowBlur = 0;
    }

    const spectrumCanvas = scope.querySelector<HTMLCanvasElement>("#spectrum-canvas");
    const spectrumCtx = spectrumCanvas?.getContext("2d") ?? null;

    function resizeSpectrumCanvas() {
      if (!spectrumCanvas) return;
      spectrumCanvas.width = spectrumCanvas.offsetWidth;
      spectrumCanvas.height = spectrumCanvas.offsetHeight;
    }
    resizeSpectrumCanvas();

    function drawSpectrumAnalyzer() {
      if (!spectrumCtx || !spectrumCanvas || !frequencyData) return;
      const width = spectrumCanvas.width;
      const height = spectrumCanvas.height;
      spectrumCtx.clearRect(0, 0, width, height);
      const barWidth = width / 256;
      let x = 0;
      for (let i = 0; i < 256; i++) {
        const barHeight = (frequencyData[i] / 255) * height * (audioSensitivity / 5);
        const hue = (i / 256) * 20 + 0;
        spectrumCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        spectrumCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
      spectrumCtx.strokeStyle = "rgba(255, 78, 66, 0.2)";
      spectrumCtx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = height * (i / 4);
        spectrumCtx.beginPath();
        spectrumCtx.moveTo(0, y);
        spectrumCtx.lineTo(width, y);
        spectrumCtx.stroke();
      }
      for (let i = 0; i < 9; i++) {
        const x = width * (i / 8);
        spectrumCtx.beginPath();
        spectrumCtx.moveTo(x, 0);
        spectrumCtx.lineTo(x, height);
        spectrumCtx.stroke();
      }
      spectrumCtx.fillStyle = "rgba(255, 78, 66, 0.7)";
      spectrumCtx.font = '10px "TheGoodMonolith", monospace';
      spectrumCtx.textAlign = "center";
      const freqLabels = ["0", "1K", "2K", "4K", "8K", "16K"];
      for (let i = 0; i < freqLabels.length; i++) {
        const x = (width / (freqLabels.length - 1)) * i;
        spectrumCtx.fillText(freqLabels[i], x, height - 5);
      }
    }

    function updateAudioWave() {
      if (!frequencyData) return;
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) {
        sum += Math.abs(audioData[i] - 128);
      }
      const average = sum / audioData.length;
      const normalizedAverage = average / audioData.length;
      const wave = scope.querySelector<HTMLElement>("#audio-wave");
      if (!wave) return;
      const scale = 1 + normalizedAverage * audioReactivity * (audioSensitivity / 5);
      wave.style.transform = `translate(-50%, -50%) scale(${scale})`;
      wave.style.borderColor = `rgba(255, 78, 66, ${0.1 + normalizedAverage * 0.3})`;
    }

    function calculateAudioMetrics() {
      if (!frequencyData) return;
      let maxValue = 0;
      let maxIndex = 0;
      for (let i = 0; i < frequencyData.length; i++) {
        if (frequencyData[i] > maxValue) {
          maxValue = frequencyData[i];
          maxIndex = i;
        }
      }
      const sampleRate = audioContext ? audioContext.sampleRate : 48000;
      const peakFrequency = (maxIndex * sampleRate) / (frequencyData.length * 2);
      let sum = 0;
      for (let i = 0; i < frequencyData.length; i++) {
        sum += frequencyData[i];
      }
      const amplitude = sum / (frequencyData.length * 255);
      const peakElement = scope.querySelector<HTMLElement>("#peak-value");
      const amplitudeElement = scope.querySelector<HTMLElement>("#amplitude-value");
      if (peakElement) peakElement.textContent = `${Math.round(peakFrequency)} HZ`;
      if (amplitudeElement) amplitudeElement.textContent = amplitude.toFixed(2);
      const stabilityValue = 50 + Math.round(amplitude * 50);
      const stabilityValueElement = scope.querySelector<HTMLElement>("#stability-value");
      const stabilityBar = scope.querySelector<HTMLElement>("#stability-bar");
      if (stabilityValueElement) stabilityValueElement.textContent = `${stabilityValue}%`;
      if (stabilityBar) stabilityBar.style.width = `${stabilityValue}%`;
      const statusIndicator = scope.querySelector<HTMLElement>("#status-indicator");
      if (statusIndicator) {
        if (stabilityValue < 40) {
          statusIndicator.style.color = "#ff00a0";
        } else if (stabilityValue < 70) {
          statusIndicator.style.color = "#ffae00";
        } else {
          statusIndicator.style.color = "#ff4e42";
        }
      }
      if (Math.random() < 0.05) {
        const massElement = scope.querySelector<HTMLElement>("#mass-value");
        const energyElement = scope.querySelector<HTMLElement>("#energy-value");
        const varianceElement = scope.querySelector<HTMLElement>("#variance-value");
        const phaseElement = scope.querySelector<HTMLElement>("#phase-value");
        if (massElement) massElement.textContent = (1 + amplitude * 2).toFixed(3);
        if (energyElement) energyElement.textContent = `${(amplitude * 10).toFixed(1)}e8 J`;
        if (varianceElement) varianceElement.textContent = (amplitude * 0.01).toFixed(4);
        const phases = ["π/4", "π/2", "π/6", "3π/4"];
        if (phaseElement)
          phaseElement.textContent = phases[Math.floor(Math.random() * phases.length)];
      }
    }

    function scheduleCrypticMessages() {
      if (crypticMessageTimeout) {
        clearTimeout(crypticMessageTimeout);
      }

      const delay = Math.random() * 15000 + 10000;

      crypticMessageTimeout = setTimeoutSafe(() => {
        if (Date.now() - lastUserActionTime > 10000) {
          const messages = [
            "GSAP.TO('#FILIP', {POSITION: 'WEBFLOW', DURATION: '3.0 QUANTUM_CYCLES'});",
            "CONST FILIP = NEW DESIGNER({SKILLS: ['GSAP', 'THREEJS', 'WEBFLOW', 'NEURAL_UI']});",
            "AWAIT WEBFLOW.HIRE(FILIP, {ROLE: 'DESIGNER', SALARY: 'COMPETITIVE'});",
            "SYSTEM.INTEGRATE(FILIP.CREATIVITY, {TARGET: 'WEBFLOW_ECOSYSTEM', EFFICIENCY: 0.97});",
            "TIMELINE.FORK({AGENT: 'FILIP', MISSION: 'ELEVATE_DIGITAL_EXPERIENCES', PROBABILITY: 0.998});",
          ];

          const selectedMessage = messages[currentMessageIndex];
          addTerminalMessage(selectedMessage, true);

          currentMessageIndex = (currentMessageIndex + 1) % messages.length;
        }

        scheduleCrypticMessages();
      }, delay);
    }

    const onMouseMove = () => {
      lastUserActionTime = Date.now();
    };
    const onClick = () => {
      lastUserActionTime = Date.now();
    };
    const onKeyDown = () => {
      lastUserActionTime = Date.now();
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);

    setTimeoutSafe(() => {
      scheduleCrypticMessages();
      setTimeoutSafe(() => {
        addTerminalMessage("FILIPPORTFOLIO.VERSION = 'EXCEPTIONAL';", true);
      }, 15000);
    }, 10000);

    const loadingOverlay = scope.querySelector<HTMLElement>("#loading-overlay");
    if (loadingOverlay) {
      setTimeoutSafe(() => {
        loadingOverlay.style.opacity = "0";
        setTimeoutSafe(() => {
          loadingOverlay.style.display = "none";
          initFloatingParticles();
          updateHeaderStatus();
        }, 500);
      }, 3000);
    }

    function updateTimestamp() {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      const timestamp = scope.querySelector<HTMLElement>("#timestamp");
      if (timestamp) timestamp.textContent = `TIME: ${hours}:${minutes}:${seconds}`;
    }
    intervals.push(setIntervalSafe(updateTimestamp, 1000));
    updateTimestamp();

    const terminalContent = scope.querySelector<HTMLElement>("#terminal-content");
    const typingLine = terminalContent?.querySelector<HTMLElement>(".typing") ?? null;
    const messageQueue = [
      "SYSTEM INITIALIZED. GEMINI LIVE VOICE LINK STANDBY.",
      "SCANNING FOR ANOMALIES IN FREQUENCY SPECTRUM.",
    ];

    function typeNextMessage() {
      if (disposed) return;
      if (messageQueue.length === 0) return;
      const message = messageQueue.shift();
      if (message === undefined) return;
      let charIndex = 0;
      const typingInterval = setInterval(() => {
        if (!typingLine) {
          clearInterval(typingInterval);
          return;
        }
        if (charIndex < message.length) {
          typingLine.textContent = message.substring(0, charIndex + 1);
          charIndex++;
        } else {
          clearInterval(typingInterval);
          if (!terminalContent) return;
          const newLine = document.createElement("div");
          newLine.className = "terminal-line command-line";
          newLine.textContent = message;
          terminalContent.insertBefore(newLine, typingLine);
          typingLine.textContent = "";
          terminalContent.scrollTop = terminalContent.scrollHeight;
          setTimeoutSafe(typeNextMessage, 5000);
        }
      }, 50);
    }
    setTimeoutSafe(typeNextMessage, 3000);

    const waveformCanvas = scope.querySelector<HTMLCanvasElement>("#waveform-canvas");
    const waveformCtx = waveformCanvas?.getContext("2d") ?? null;

    function resizeCanvas() {
      if (!waveformCanvas || !waveformCtx) return;
      waveformCanvas.width = waveformCanvas.offsetWidth * window.devicePixelRatio;
      waveformCanvas.height = waveformCanvas.offsetHeight * window.devicePixelRatio;
      waveformCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resizeCanvas();

    function drawWaveform() {
      if (disposed) return;
      if (!waveformCanvas || !waveformCtx) return;
      const width = waveformCanvas.width / window.devicePixelRatio;
      const height = waveformCanvas.height / window.devicePixelRatio;
      waveformCtx.clearRect(0, 0, width, height);
      waveformCtx.fillStyle = "rgba(0, 0, 0, 0.2)";
      waveformCtx.fillRect(0, 0, width, height);
      waveformCtx.beginPath();
      waveformCtx.strokeStyle = "rgba(255, 78, 66, 0.8)";
      waveformCtx.lineWidth = 2;
      const sliceWidth = width / audioData.length;
      let x = 0;
      for (let i = 0; i < audioData.length; i++) {
        const v = audioData[i] / 128.0;
        const y = (v * height) / 2;
        if (i === 0) {
          waveformCtx.moveTo(x, y);
        } else {
          waveformCtx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      waveformCtx.stroke();
      schedule(drawWaveform);
    }
    schedule(drawWaveform);

    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let controls: OrbitControls;
    let anomalyObject: THREE.Group;
    let distortionAmount = 1.0;
    let resolution = 32;
    const clock = new THREE.Clock();
    let isDraggingAnomaly = false;
    const anomalyVelocity = new THREE.Vector2(0, 0);
    const anomalyTargetPosition = new THREE.Vector3(0, 0, 0);
    const anomalyOriginalPosition = new THREE.Vector3(0, 0, 0);
    const defaultCameraPosition = new THREE.Vector3(0, 0, 10);
    const zoomedCameraPosition = new THREE.Vector3(0, 0, 7);
    const cameraTarget = defaultCameraPosition.clone();
    let removeDragListeners: () => void = () => {};

    function zoomCameraForAudio(zoomIn: boolean) {
      const targetPosition = zoomIn ? zoomedCameraPosition : defaultCameraPosition;
      cameraTarget.copy(targetPosition);
      if (zoomIn) {
        addTerminalMessage("CAMERA.ZOOM(TARGET: 0.7, DURATION: 1.5, EASE: 'POWER2.INOUT');", true);
      } else {
        addTerminalMessage("CAMERA.ZOOM(TARGET: 1.0, DURATION: 1.5, EASE: 'POWER2.INOUT');", true);
      }
    }

    function setupAnomalyDragging() {
      const container = scope.querySelector<HTMLElement>("#three-container");
      if (!container) return () => {};
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      let isDragging = false;
      let dragStartPosition = new THREE.Vector2();
      anomalyOriginalPosition.set(0, 0, 0);
      anomalyTargetPosition.set(0, 0, 0);
      const maxDragDistance = 3;
      const onMouseDown = (event: MouseEvent) => {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(anomalyObject, true);
        if (intersects.length > 0) {
          controls.enabled = false;
          isDragging = true;
          isDraggingAnomaly = true;
          dragStartPosition.x = mouse.x;
          dragStartPosition.y = mouse.y;
          addTerminalMessage("ANOMALY INTERACTION DETECTED. PHYSICS SIMULATION ACTIVE.", true);
          showNotification("ANOMALY INTERACTION DETECTED");
        }
      };
      const onMouseMove = (event: MouseEvent) => {
        if (isDragging) {
          mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
          mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
          const deltaX = (mouse.x - dragStartPosition.x) * 5;
          const deltaY = (mouse.y - dragStartPosition.y) * 5;
          anomalyTargetPosition.x += deltaX;
          anomalyTargetPosition.y += deltaY;
          const distance = Math.sqrt(
            anomalyTargetPosition.x * anomalyTargetPosition.x +
              anomalyTargetPosition.y * anomalyTargetPosition.y,
          );
          if (distance > maxDragDistance) {
            const scale = maxDragDistance / distance;
            anomalyTargetPosition.x *= scale;
            anomalyTargetPosition.y *= scale;
          }
          anomalyVelocity.x = deltaX * 2;
          anomalyVelocity.y = deltaY * 2;
          dragStartPosition.x = mouse.x;
          dragStartPosition.y = mouse.y;
        }
      };
      const onMouseUp = () => {
        if (isDragging) {
          controls.enabled = true;
          isDragging = false;
          isDraggingAnomaly = false;
          addTerminalMessage(
            `INERTIAPLUGIN.TRACK('#ANOMALY', {THROWRESISTANCE: 0.45, VELOCITY: {X: ${anomalyVelocity.x.toFixed(
              2,
            )}, Y: ${anomalyVelocity.y.toFixed(2)}}});`,
            true,
          );
        }
      };
      const onMouseLeave = () => {
        if (isDragging) {
          controls.enabled = true;
          isDragging = false;
          isDraggingAnomaly = false;
        }
      };
      container.addEventListener("mousedown", onMouseDown);
      container.addEventListener("mousemove", onMouseMove);
      container.addEventListener("mouseup", onMouseUp);
      container.addEventListener("mouseleave", onMouseLeave);
      return () => {
        container.removeEventListener("mousedown", onMouseDown);
        container.removeEventListener("mousemove", onMouseMove);
        container.removeEventListener("mouseup", onMouseUp);
        container.removeEventListener("mouseleave", onMouseLeave);
      };
    }

    function createBackgroundParticles() {
      const particlesGeometry = new THREE.BufferGeometry();
      const particleCount = 3000;
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);
      const sizes = new Float32Array(particleCount);
      const color1 = new THREE.Color(0xff4e42);
      const color2 = new THREE.Color(0xc2362f);
      const color3 = new THREE.Color(0xffb3ab);
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
        let color;
        const colorChoice = Math.random();
        if (colorChoice < 0.33) {
          color = color1;
        } else if (colorChoice < 0.66) {
          color = color2;
        } else {
          color = color3;
        }
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
        sizes[i] = 0.05;
      }
      particlesGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      particlesGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      particlesGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
      const particlesMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
        },
        vertexShader: `
          attribute float size;
          varying vec3 vColor;
          uniform float time;

          void main() {
            vColor = color;

            vec3 pos = position;
            pos.x += sin(time * 0.1 + position.z * 0.2) * 0.05;
            pos.y += cos(time * 0.1 + position.x * 0.2) * 0.05;
            pos.z += sin(time * 0.1 + position.y * 0.2) * 0.05;

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = size * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;

          void main() {
            float r = distance(gl_PointCoord, vec2(0.5, 0.5));
            if (r > 0.5) discard;

            float glow = 1.0 - (r * 2.0);
            glow = pow(glow, 2.0);

            gl_FragColor = vec4(vColor, glow);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      });
      const particles = new THREE.Points(particlesGeometry, particlesMaterial);
      scene.add(particles);
      return function updateParticles(time: number) {
        particlesMaterial.uniforms.time.value = time;
      };
    }

    function createAnomalyObject() {
      if (anomalyObject) {
        scene.remove(anomalyObject);
      }
      anomalyObject = new THREE.Group();
      const radius = 2;
      const outerGeometry = new THREE.IcosahedronGeometry(
        radius,
        Math.max(1, Math.floor(resolution / 8)),
      );
      const outerMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          color: { value: new THREE.Color(0xff4e42) },
          audioLevel: { value: 0 },
          distortion: { value: distortionAmount },
        },
        vertexShader: `
      uniform float time;
      uniform float audioLevel;
      uniform float distortion;
      varying vec3 vNormal;
      varying vec3 vPosition;

      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);

        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);

        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;

        i = mod289(i);
        vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0));

        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;

        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);

        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);

        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);

        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));

        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);

        vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;

        vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
      }

      void main() {
        vNormal = normalize(normalMatrix * normal);

        float slowTime = time * 0.3;
        vec3 pos = position;

        float noise = snoise(vec3(position.x * 0.5, position.y * 0.5, position.z * 0.5 + slowTime));
        pos += normal * noise * 0.2 * distortion * (1.0 + audioLevel);

        vPosition = pos;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
        fragmentShader: `
      uniform float time;
      uniform vec3 color;
      uniform float audioLevel;
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        vec3 viewDirection = normalize(cameraPosition - vPosition);
        float fresnel = 1.0 - max(0.0, dot(viewDirection, vNormal));
        fresnel = pow(fresnel, 2.0 + audioLevel * 2.0);

        float pulse = 0.8 + 0.2 * sin(time * 2.0);

        vec3 finalColor = color * fresnel * pulse * (1.0 + audioLevel * 0.8);

        float alpha = fresnel * (0.7 - audioLevel * 0.3);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
        wireframe: true,
        transparent: true,
      });
      const outerSphere = new THREE.Mesh(outerGeometry, outerMaterial);
      anomalyObject.add(outerSphere);
      scene.add(anomalyObject);
      const glowGeometry = new THREE.SphereGeometry(radius * 1.2, 32, 32);
      const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          color: { value: new THREE.Color(0xff4e42) },
          audioLevel: { value: 0 },
        },
        vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      uniform float audioLevel;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position * (1.0 + audioLevel * 0.2);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(vPosition, 1.0);
      }
    `,
        fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      uniform vec3 color;
      uniform float time;
      uniform float audioLevel;

      void main() {
        vec3 viewDirection = normalize(cameraPosition - vPosition);
        float fresnel = 1.0 - max(0.0, dot(viewDirection, vNormal));
        fresnel = pow(fresnel, 3.0 + audioLevel * 3.0);

        float pulse = 0.5 + 0.5 * sin(time * 2.0);
        float audioFactor = 1.0 + audioLevel * 3.0;

        vec3 finalColor = color * fresnel * (0.8 + 0.2 * pulse) * audioFactor;

        float alpha = fresnel * (0.3 * audioFactor) * (1.0 - audioLevel * 0.2);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
      anomalyObject.add(glowSphere);
      return function updateAnomaly(time: number, audioLevel: number) {
        outerMaterial.uniforms.time.value = time;
        outerMaterial.uniforms.audioLevel.value = audioLevel;
        outerMaterial.uniforms.distortion.value = distortionAmount;
        glowMaterial.uniforms.time.value = time;
        glowMaterial.uniforms.audioLevel.value = audioLevel;
      };
    }

    function updateWireframeDistortion(amount: number) {
      distortionAmount = amount;
      updateGlow = createAnomalyObject();
    }

    function updateWireframeResolution(newResolution: number) {
      resolution = newResolution;
      updateGlow = createAnomalyObject();
    }

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      resizeCanvas();
      resizeCircularCanvas();
      resizeSpectrumCanvas();
    }

    function updateAnomalyPosition() {
      if (!isDraggingAnomaly) {
        anomalyVelocity.x *= 0.95;
        anomalyVelocity.y *= 0.95;
        anomalyTargetPosition.x += anomalyVelocity.x * 0.1;
        anomalyTargetPosition.y += anomalyVelocity.y * 0.1;
        const springStrength = 0.1;
        anomalyVelocity.x -= anomalyTargetPosition.x * springStrength;
        anomalyVelocity.y -= anomalyTargetPosition.y * springStrength;
        if (Math.abs(anomalyTargetPosition.x) < 0.05 && Math.abs(anomalyTargetPosition.y) < 0.05) {
          anomalyTargetPosition.set(0, 0, 0);
          anomalyVelocity.set(0, 0);
        }
        const bounceThreshold = 3;
        const bounceDamping = 0.8;
        if (Math.abs(anomalyTargetPosition.x) > bounceThreshold) {
          anomalyVelocity.x = -anomalyVelocity.x * bounceDamping;
          anomalyTargetPosition.x = Math.sign(anomalyTargetPosition.x) * bounceThreshold;
          if (Math.abs(anomalyVelocity.x) > 0.1) {
            addTerminalMessage(
              "ANOMALY BOUNDARY COLLISION DETECTED. ENERGY TRANSFER: " +
                (Math.abs(anomalyVelocity.x) * 100).toFixed(0) +
                " UNITS",
            );
          }
        }
        if (Math.abs(anomalyTargetPosition.y) > bounceThreshold) {
          anomalyVelocity.y = -anomalyVelocity.y * bounceDamping;
          anomalyTargetPosition.y = Math.sign(anomalyTargetPosition.y) * bounceThreshold;
          if (Math.abs(anomalyVelocity.y) > 0.1) {
            addTerminalMessage(
              "ANOMALY BOUNDARY COLLISION DETECTED. ENERGY TRANSFER: " +
                (Math.abs(anomalyVelocity.y) * 100).toFixed(0) +
                " UNITS",
            );
          }
        }
      }
      anomalyObject.position.x += (anomalyTargetPosition.x - anomalyObject.position.x) * 0.2;
      anomalyObject.position.y += (anomalyTargetPosition.y - anomalyObject.position.y) * 0.2;
      if (!isDraggingAnomaly) {
        anomalyObject.rotation.x += anomalyVelocity.y * 0.01;
        anomalyObject.rotation.y += anomalyVelocity.x * 0.01;
      }
    }

    function animate() {
      if (disposed) return;
      schedule(animate);
      controls.update();
      const time = clock.getElapsedTime();

      let audioLevel = 0;
      const liveLevel = getLiveLevel();
      // Attack/release smoothing on the raw level so rises and falls glide
      // instead of snapping, which is what makes the audio visualisation feel
      // smooth even when the microphone level is noisy.
      const levelTarget = Math.max(0, liveLevel);
      const levelAttack = levelTarget > smoothedLevel ? 0.22 : 0.06;
      smoothedLevel += (levelTarget - smoothedLevel) * levelAttack;
      if (audioAnalyser) {
        audioAnalyser.getByteFrequencyData(frequencyData);
        audioAnalyser.getByteTimeDomainData(audioData);
      } else {
        synthesizeAudioData(smoothedLevel, time);
      }
      let sum = 0;
      for (let i = 0; i < frequencyData.length; i++) {
        sum += frequencyData[i];
      }
      audioLevel = ((sum / frequencyData.length / 255) * audioSensitivity) / 5;
      audioLevel = Math.max(audioLevel, smoothedLevel * 0.8);

      drawCircularVisualizer();
      drawSpectrumAnalyzer();
      updateAudioWave();
      calculateAudioMetrics();

      updateAnomalyPosition();
      if (updateGlow) {
        updateGlow(time, audioLevel);
      }
      if (updateParticles) {
        updateParticles(time);
      }
      const rotationSlider = scope.querySelector<HTMLInputElement>("#rotation-slider");
      const rotationSpeed = parseFloat(rotationSlider?.value ?? "1");
      if (anomalyObject) {
        const audioRotationFactor = 1 + audioLevel * audioReactivity;
        anomalyObject.rotation.y += 0.005 * rotationSpeed * audioRotationFactor;
        anomalyObject.rotation.z += 0.002 * rotationSpeed * audioRotationFactor;
      }

      camera.position.x += (cameraTarget.x - camera.position.x) * 0.06;
      camera.position.y += (cameraTarget.y - camera.position.y) * 0.06;
      camera.position.z += (cameraTarget.z - camera.position.z) * 0.06;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      updateHeaderStatus();
      updateScannerFrame();
    }

    function initThreeJS() {
      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0a0e17, 0.05);
      camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.copy(defaultCameraPosition);
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        stencil: false,
        depth: true,
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(window.devicePixelRatio);
      const container = scope.querySelector<HTMLElement>("#three-container");
      if (container) container.appendChild(renderer.domElement);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.rotateSpeed = 0.5;
      controls.zoomSpeed = 0.7;
      controls.panSpeed = 0.8;
      controls.minDistance = 3;
      controls.maxDistance = 30;
      controls.enableZoom = false;
      const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
      scene.add(ambientLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
      directionalLight.position.set(1, 1, 1);
      scene.add(directionalLight);
      const pointLight1 = new THREE.PointLight(0xff4e42, 1, 10);
      pointLight1.position.set(2, 2, 2);
      scene.add(pointLight1);
      const pointLight2 = new THREE.PointLight(0xc2362f, 1, 10);
      pointLight2.position.set(-2, -2, -2);
      scene.add(pointLight2);
      createAnomalyObject();
      createBackgroundParticles();
      window.addEventListener("resize", onWindowResize);
      removeDragListeners = setupAnomalyDragging();
      animate();
    }

    initThreeJS();
    updateParticles = createBackgroundParticles();
    updateGlow = createAnomalyObject();

    // Sliders (hidden panel — kept verbatim)
    const rotationSlider = scope.querySelector<HTMLInputElement>("#rotation-slider");
    const resolutionSlider = scope.querySelector<HTMLInputElement>("#resolution-slider");
    const distortionSlider = scope.querySelector<HTMLInputElement>("#distortion-slider");
    const reactivitySlider = scope.querySelector<HTMLInputElement>("#reactivity-slider");
    const sensitivitySlider = scope.querySelector<HTMLInputElement>("#sensitivity-slider");
    rotationSlider?.addEventListener("input", function () {
      const el = scope.querySelector<HTMLElement>("#rotation-value");
      if (el) el.textContent = this.value;
    });
    resolutionSlider?.addEventListener("input", function () {
      const value = parseInt(this.value);
      const el = scope.querySelector<HTMLElement>("#resolution-value");
      if (el) el.textContent = String(value);
      updateWireframeResolution(value);
    });
    distortionSlider?.addEventListener("input", function () {
      const value = parseFloat(this.value);
      const el = scope.querySelector<HTMLElement>("#distortion-value");
      if (el) el.textContent = value.toFixed(1);
      updateWireframeDistortion(value);
    });
    reactivitySlider?.addEventListener("input", function () {
      audioReactivity = parseFloat(this.value);
      const el = scope.querySelector<HTMLElement>("#reactivity-value");
      if (el) el.textContent = audioReactivity.toFixed(1);
    });
    sensitivitySlider?.addEventListener("input", function () {
      audioSensitivity = parseFloat(this.value);
      const el = scope.querySelector<HTMLElement>("#sensitivity-value");
      if (el) el.textContent = audioSensitivity.toString();
    });
    const resetBtn = scope.querySelector<HTMLElement>("#reset-btn");
    resetBtn?.addEventListener("click", function () {
      if (rotationSlider) rotationSlider.value = "1.0";
      const rv = scope.querySelector<HTMLElement>("#rotation-value");
      if (rv) rv.textContent = "1.0";
      if (resolutionSlider) resolutionSlider.value = "32";
      const resv = scope.querySelector<HTMLElement>("#resolution-value");
      if (resv) resv.textContent = "32";
      if (distortionSlider) distortionSlider.value = "1.0";
      const dv = scope.querySelector<HTMLElement>("#distortion-value");
      if (dv) dv.textContent = "1.0";
      if (reactivitySlider) reactivitySlider.value = "1.0";
      const av = scope.querySelector<HTMLElement>("#reactivity-value");
      if (av) av.textContent = "1.0";
      audioReactivity = 1.0;
      if (sensitivitySlider) sensitivitySlider.value = "5.0";
      const sv = scope.querySelector<HTMLElement>("#sensitivity-value");
      if (sv) sv.textContent = "5.0";
      audioSensitivity = 5.0;
      distortionAmount = 1.0;
      resolution = 32;
      updateGlow = createAnomalyObject();
      anomalyTargetPosition.set(0, 0, 0);
      anomalyVelocity.set(0, 0);
      anomalyObject.position.set(0, 0, 0);
      showNotification("SETTINGS RESET TO DEFAULT VALUES");
    });
    const analyzeBtn = scope.querySelector<HTMLButtonElement>("#analyze-btn");
    analyzeBtn?.addEventListener("click", function () {
      this.textContent = "ANALYZING...";
      this.disabled = true;
      const stabilityBar = scope.querySelector<HTMLElement>("#stability-bar");
      const stabilityValue = scope.querySelector<HTMLElement>("#stability-value");
      const statusIndicator = scope.querySelector<HTMLElement>("#status-indicator");
      if (stabilityBar) stabilityBar.style.width = "45%";
      if (stabilityValue) stabilityValue.textContent = "45%";
      if (statusIndicator) statusIndicator.style.color = "#ff00a0";
      setTimeoutSafe(() => {
        this.textContent = "ANALYZE";
        this.disabled = false;
        addTerminalMessage("ANALYSIS COMPLETE. ANOMALY SIGNATURE IDENTIFIED.", true);
        showNotification("ANOMALY ANALYSIS COMPLETE");
        const massElement = scope.querySelector<HTMLElement>("#mass-value");
        const energyElement = scope.querySelector<HTMLElement>("#energy-value");
        const varianceElement = scope.querySelector<HTMLElement>("#variance-value");
        const peakElement = scope.querySelector<HTMLElement>("#peak-value");
        const amplitudeElement = scope.querySelector<HTMLElement>("#amplitude-value");
        const phaseElement = scope.querySelector<HTMLElement>("#phase-value");
        if (massElement) massElement.textContent = (Math.random() * 2 + 1).toFixed(3);
        if (energyElement) energyElement.textContent = (Math.random() * 9 + 1).toFixed(1) + "e8 J";
        if (varianceElement) varianceElement.textContent = (Math.random() * 0.01).toFixed(4);
        if (peakElement) peakElement.textContent = (Math.random() * 200 + 100).toFixed(1) + " HZ";
        if (amplitudeElement) amplitudeElement.textContent = (Math.random() * 0.5 + 0.3).toFixed(2);
        const phases = ["π/4", "π/2", "π/6", "3π/4"];
        if (phaseElement)
          phaseElement.textContent = phases[Math.floor(Math.random() * phases.length)];
      }, 3000);
    });
    scope.querySelectorAll<HTMLButtonElement>(".demo-track-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        if (!isAudioInitialized) {
          initAudio();
        }
        if (audioContext && audioContext.state === "suspended") {
          audioContext.resume();
        }
        const url = btn.dataset.url ?? "";
        scope.querySelectorAll(".demo-track-btn").forEach((b) => {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        loadAudioFromURL(url);
      });
    });
    const fileBtn = scope.querySelector<HTMLElement>("#file-btn");
    fileBtn?.addEventListener("click", function () {
      if (!isAudioInitialized) {
        initAudio();
      }
      if (audioContext && audioContext.state === "suspended") {
        audioContext.resume();
      }
      const input = scope.querySelector<HTMLElement>("#audio-file-input");
      input?.click();
    });
    const audioFileInput = scope.querySelector<HTMLInputElement>("#audio-file-input");
    audioFileInput?.addEventListener("change", function (e) {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        initAudioFile(files[0]);
      }
    });
    const audioPlayer = scope.querySelector<HTMLAudioElement>("#audio-player");
    audioPlayer?.addEventListener("ended", function () {
      zoomCameraForAudio(false);
      addTerminalMessage("AUDIO PLAYBACK COMPLETE.");
    });

    // The scanner frame is the microphone.
    const scannerFrame = scope.querySelector<HTMLElement>(".scanner-frame");
    scannerFrame?.addEventListener("click", toggleVoice);

    return () => {
      disposed = true;
      rafIds.forEach((id) => cancelAnimationFrame(id));
      intervals.forEach((id) => clearInterval(id));
      timeouts.forEach((id) => clearTimeout(id));
      if (crypticMessageTimeout) clearTimeout(crypticMessageTimeout);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onWindowResize);
      removeDragListeners();
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
      liveRef.current.stop();
    };
  }, []);

  return (
    <div ref={scopeRef} className="scanner-scope">
      <div className="space-background" />

      <div className="loading-overlay" id="loading-overlay">
        <div className="loading-container">
          <div className="preloader-canvas-container">
            <canvas id="preloader-canvas" className="preloader-canvas" width="180" height="180" />
          </div>
          <div className="loading-text">INITIALIZING SCANNER</div>
        </div>
      </div>

      <div className="notification" id="notification">
        Anomaly detected
      </div>

      <div id="three-container" />

      <div className="grid-overlay" />

      <div className="circular-visualizer">
        <canvas id="circular-canvas" />
      </div>

      <div className="audio-wave" id="audio-wave" />

      <div className="floating-particles" id="floating-particles" />

      <div className="interface-container">
        <div className="header">
          <div className="header-item" />
          <div className="header-item">
            GSAP.INERTIA.WEBFLOW.TIMELINE
            <br />
            v3.13.0
          </div>
          <div className="header-item" id="timestamp">
            TIME: 00:00:00
          </div>
        </div>

        <div className="scanner-frame">
          <div className="corner-tl" />
          <div className="corner-tr" />
          <div className="corner-bl" />
          <div className="corner-br" />
          <div className="scanner-id">GSAP.TIMELINE({"{ONSTART: WEBFLOW.INIT}"})</div>
          <div className="scanner-id-right">IX2.ANIMATION.SEQUENCE(0x4F2E)</div>
        </div>
      </div>

      <div className="data-panel" style={{ position: "absolute", top: "20px", left: "20px" }}>
        <div className="data-panel-title">
          <span>ANOMALY METRICS</span>
          <span id="status-indicator">●</span>
        </div>
        <div className="data-bar">
          <div className="data-bar-fill" id="stability-bar" style={{ width: "75%" }} />
        </div>
        <div className="data-readouts">
          <div className="data-row">
            <span className="data-label">STABILITY INDEX:</span>
            <span className="data-value" id="stability-value">
              75%
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">MASS COEFFICIENT:</span>
            <span className="data-value" id="mass-value">
              1.728
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">ENERGY SIGNATURE:</span>
            <span className="data-value" id="energy-value">
              5.3e8 J
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">QUANTUM VARIANCE:</span>
            <span className="data-value" id="variance-value">
              0.0042
            </span>
          </div>
        </div>
      </div>

      <div className="data-panel" style={{ position: "absolute", top: "20px", right: "20px" }}>
        <div className="data-panel-title">ANOMALY METRICS</div>
        <div className="waveform">
          <canvas id="waveform-canvas" className="waveform-canvas" />
        </div>
        <div className="data-readouts">
          <div className="data-row">
            <span className="data-label">PEAK FREQUENCY:</span>
            <span className="data-value" id="peak-value">
              127.3 HZ
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">AMPLITUDE:</span>
            <span className="data-value" id="amplitude-value">
              0.56
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">PHASE SHIFT:</span>
            <span className="data-value" id="phase-value">
              π/4
            </span>
          </div>
        </div>
      </div>

      <div
        className="control-panel"
        style={{ top: "50%", left: "20px", transform: "translateY(-50%)" }}
      >
        <div className="panel-header">
          <span className="data-panel-title">ANOMALY CONTROLS</span>
          <span className="drag-handle" id="control-panel-handle">
            ⋮⋮
          </span>
        </div>
        <div className="control-group">
          <div className="control-row">
            <span className="control-label">ROTATION SPEED</span>
            <span className="control-value" id="rotation-value">
              1.0
            </span>
          </div>
          <div className="slider-container">
            <input
              type="range"
              min="0"
              max="5"
              defaultValue="1"
              step="0.1"
              className="slider"
              id="rotation-slider"
            />
          </div>
        </div>

        <div className="control-group">
          <div className="control-row">
            <span className="control-label">RESOLUTION</span>
            <span className="control-value" id="resolution-value">
              32
            </span>
          </div>
          <div className="slider-container">
            <input
              type="range"
              min="12"
              max="64"
              defaultValue="32"
              step="4"
              className="slider"
              id="resolution-slider"
            />
          </div>
        </div>

        <div className="control-group">
          <div className="control-row">
            <span className="control-label">DISTORTION</span>
            <span className="control-value" id="distortion-value">
              1.0
            </span>
          </div>
          <div className="slider-container">
            <input
              type="range"
              min="0"
              max="3"
              defaultValue="1"
              step="0.1"
              className="slider"
              id="distortion-slider"
            />
          </div>
        </div>

        <div className="control-group">
          <div className="control-row">
            <span className="control-label">AUDIO REACTIVITY</span>
            <span className="control-value" id="reactivity-value">
              1.0
            </span>
          </div>
          <div className="slider-container">
            <input
              type="range"
              min="0"
              max="2"
              defaultValue="1"
              step="0.1"
              className="slider"
              id="reactivity-slider"
            />
          </div>
        </div>

        <div className="buttons">
          <button className="btn" id="reset-btn">
            RESET
          </button>
          <button className="btn" id="analyze-btn">
            ANALYZE
          </button>
        </div>
      </div>

      <div className="terminal-panel">
        <div className="terminal-header">
          <span>SYSTEM TERMINAL</span>
          <span id="terminal-status">ONLINE</span>
        </div>
        <div className="terminal-content" id="terminal-content">
          <div className="terminal-line">
            NEXUS v3.7.2 INITIALIZED. SECURE CONNECTION ESTABLISHED.
          </div>
          <div className="terminal-line command-line">
            gsap.inertia.init(throwProps: true, resistance: 0.35);
          </div>
          <div className="terminal-line regular-line">
            Draggable.create({"{"}bounds: window, inertia: true, edgeResistance: 0.65
            {"}"});
          </div>
          <div className="terminal-line command-line">
            webflow.interactions.trigger('IX2', {"{value: 'anomaly-detection'}"});
          </div>
          <div className="terminal-line typing" />
        </div>
      </div>

      <div className="spectrum-analyzer">
        <div className="spectrum-header">
          <span>AUDIO SPECTRUM ANALYZER</span>
          <span className="drag-handle" id="spectrum-handle">
            ⋮⋮
          </span>
        </div>
        <div className="spectrum-content">
          <canvas id="spectrum-canvas" className="spectrum-canvas" />
        </div>
        <div className="audio-controls">
          <div className="demo-tracks">
            <span className="demo-tracks-label">DEMO TRACKS:</span>
            <button
              className="demo-track-btn"
              data-url="https://assets.codepen.io/7558/Merkaba.mp3"
            >
              MERKABA
            </button>
            <button
              className="demo-track-btn"
              data-url="https://assets.codepen.io/7558/Dhamika.mp3"
            >
              DHAMIKA
            </button>
            <button className="demo-track-btn" data-url="https://assets.codepen.io/7558/Vacant.mp3">
              VACANT
            </button>
            <button
              className="demo-track-btn"
              data-url="https://assets.codepen.io/7558/lxstnght-back_1.mp3"
            >
              LXSTNGHT
            </button>
          </div>

          <input type="file" id="audio-file-input" className="audio-file-input" accept="audio/*" />
          <button className="audio-file-btn" id="file-btn">
            UPLOAD AUDIO FILE
          </button>
          <div className="audio-file-label" id="file-label">
            NO FILE SELECTED
          </div>

          {/* Audio player for local files - captions not applicable */}
          {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
          <audio id="audio-player" className="audio-player" crossOrigin="anonymous" />

          <div className="controls-row">
            <div className="audio-sensitivity" style={{ flex: 1 }}>
              <div className="audio-sensitivity-label">
                <span>SENSITIVITY</span>
                <span className="audio-sensitivity-value" id="sensitivity-value">
                  5.0
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                defaultValue="5"
                step="0.1"
                className="slider"
                id="sensitivity-slider"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
