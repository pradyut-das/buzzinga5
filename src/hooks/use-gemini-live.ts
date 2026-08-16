"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, type LiveServerMessage, type Session } from "@google/genai";

export type LiveState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

export interface LiveTranscriptLine {
  id: string;
  role: "you" | "agent" | "system";
  text: string;
}

/** Gemini Live speaks 24 kHz PCM and expects 16 kHz PCM from the microphone. */
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const CAPTURE_FRAMES = 2048;

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function floatToPcm16(input: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

interface UseGeminiLiveOptions {
  /** Called after any tool that reported `executed`, so the dashboard can refresh. */
  onMutation?: () => void;
}

/**
 * Owns one Gemini Live voice session end to end: the ephemeral token, the
 * microphone, playback, and the tool bridge.
 *
 * Tool calls do not run in the browser. Each one is posted to
 * `/api/agent/tool`, which re-checks the session cookie and board membership
 * before touching the database, then the result is handed back to Gemini.
 */
export function useGeminiLive({ onMutation }: UseGeminiLiveOptions = {}) {
  const [state, setState] = useState<LiveState>("idle");
  const [detail, setDetail] = useState<string>("");
  const [transcript, setTranscript] = useState<LiveTranscriptLine[]>([]);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  /** The write waiting on a yes from the screen, if any. */
  const [pendingWrite, setPendingWrite] = useState<{ name: string; summary: string } | null>(null);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const sessionRef = useRef<Session | null>(null);
  /** Ledger id for the session's up-front charge, so it can be settled on hang-up. */
  const usageSessionRef = useRef<string | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackLevelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackLevelDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const playheadRef = useRef(0);
  const partialRef = useRef({ user: "", agent: "" });
  const mutatedRef = useRef(false);
  const decisionRef = useRef<((approved: boolean) => void) | null>(null);
  const onMutationRef = useRef(onMutation);
  onMutationRef.current = onMutation;

  const push = useCallback((role: LiveTranscriptLine["role"], text: string) => {
    if (!text.trim()) return;
    setTranscript((lines) => [
      ...lines.slice(-40),
      { id: crypto.randomUUID(), role, text: text.trim() },
    ]);
  }, []);

  const teardownAudio = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    captureContextRef.current?.close().catch(() => {});
    captureContextRef.current = null;
    if (playbackLevelTimerRef.current) {
      clearInterval(playbackLevelTimerRef.current);
      playbackLevelTimerRef.current = null;
    }
    playbackAnalyserRef.current = null;
    playbackLevelDataRef.current = null;
    setInputLevel(0);
    setOutputLevel(0);
  }, []);

  /**
   * Tells the server how long the session actually ran.
   *
   * `/api/agent/session` charges the token's full lifetime up front so an
   * abandoned session still counts against the spend cap; this reports the
   * real duration so the unused remainder is refunded. Fire-and-forget and
   * best-effort — failing to settle costs an over-estimate in the ledger,
   * which is the safe direction to be wrong in.
   */
  const settleUsage = useCallback(() => {
    const sessionId = usageSessionRef.current;
    const startedAt = sessionStartedAtRef.current;
    usageSessionRef.current = null;
    sessionStartedAtRef.current = null;
    if (!sessionId || startedAt === null) return;
    void fetch("/api/agent/voice-usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, durationMs: Date.now() - startedAt }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const stop = useCallback(() => {
    settleUsage();
    try {
      sessionRef.current?.close();
    } catch {
      // A session that already closed is not an error worth surfacing.
    }
    sessionRef.current = null;
    // Hanging up is a no: never leave a prepared write parked on a dead session.
    decisionRef.current?.(false);
    teardownAudio();
    playbackContextRef.current?.close().catch(() => {});
    playbackContextRef.current = null;
    playheadRef.current = 0;
    setState("idle");
    setDetail("");
    setActiveTool(null);
  }, [teardownAudio, settleUsage]);

  useEffect(() => () => stop(), [stop]);

  const startPlaybackLevelMeter = useCallback(() => {
    // The level is polled continuously while audio is queued, so the visuals
    // keep animating for the whole turn instead of dropping to zero between
    // the chunks that arrive faster than real time.
    if (playbackLevelTimerRef.current) return;
    playbackLevelTimerRef.current = setInterval(() => {
      const analyser = playbackAnalyserRef.current;
      if (!analyser) {
        setOutputLevel(0);
        return;
      }
      const data = playbackLevelDataRef.current ?? new Uint8Array(analyser.fftSize);
      playbackLevelDataRef.current = data;
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const value = (data[i] - 128) / 128;
        const abs = Math.abs(value);
        peak = Math.max(peak, abs);
        sum += abs * abs;
      }
      const rms = Math.sqrt(sum / data.length);
      // Blend peak and RMS: peak catches transients, RMS keeps the meter from
      // flickering on silence.
      setOutputLevel(Math.min(1, Math.max(peak * 0.7, rms * 1.6)));
    }, 50);
  }, []);

  const playChunk = useCallback(
    (base64: string) => {
      const context = playbackContextRef.current ?? new AudioContext({ sampleRate: OUTPUT_RATE });
      playbackContextRef.current = context;
      void context.resume();

      const bytes = decodeBase64(base64);
      const samples = new Int16Array(
        bytes.buffer,
        bytes.byteOffset,
        Math.floor(bytes.byteLength / 2),
      );
      const buffer = context.createBuffer(1, samples.length, OUTPUT_RATE);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        const value = samples[index] / 0x8000;
        channel[index] = value;
      }

      const source = context.createBufferSource();
      source.buffer = buffer;
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      playbackAnalyserRef.current = analyser;
      source.connect(context.destination);
      // Chunks arrive faster than real time, so they are queued against a moving
      // playhead rather than played on arrival, which would overlap them.
      const startAt = Math.max(context.currentTime, playheadRef.current);
      source.start(startAt);
      playheadRef.current = startAt + buffer.duration;
      startPlaybackLevelMeter();
    },
    [startPlaybackLevelMeter],
  );

  const stopPlayback = useCallback(() => {
    // Barge-in: drop everything queued so the agent stops mid-sentence.
    playbackContextRef.current?.close().catch(() => {});
    playbackContextRef.current = null;
    if (playbackLevelTimerRef.current) {
      clearInterval(playbackLevelTimerRef.current);
      playbackLevelTimerRef.current = null;
    }
    playbackAnalyserRef.current = null;
    playbackLevelDataRef.current = null;
    playheadRef.current = 0;
    setOutputLevel(0);
  }, []);

  const callTool = useCallback(async (name: string, input: Record<string, unknown>) => {
    try {
      const response = await fetch("/api/agent/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, input }),
      });
      return (await response.json()) as { status?: string; summary?: string; message?: string };
    } catch {
      return { status: "error", message: "The planner did not respond. Try again." };
    }
  }, []);

  const handleToolCall = useCallback(
    async (message: LiveServerMessage) => {
      const calls = message.toolCall?.functionCalls ?? [];
      if (!calls.length) return;

      setState("thinking");
      const responses = [];
      for (const call of calls) {
        const name = call.name ?? "";
        setActiveTool(name || "tool");

        // The model never gets to say a write is confirmed: the first call is
        // always a dry run, and the yes comes from the person on screen.
        let result = await callTool(name, { ...call.args, confirmed: false });

        if (result.status === "confirmation_required" && result.summary) {
          const summary = result.summary;
          push("system", `Waiting on you: ${summary}`);
          const approved = await new Promise<boolean>((resolve) => {
            decisionRef.current = resolve;
            setPendingWrite({ name, summary });
          });
          decisionRef.current = null;
          setPendingWrite(null);

          if (approved) {
            setActiveTool(name || "tool");
            result = await callTool(name, { ...call.args, confirmed: true });
          } else {
            result = {
              status: "cancelled",
              message: "The user declined this change on screen. Nothing was written.",
            };
            push("system", "Cancelled.");
          }
        }

        if (result.status === "executed") {
          mutatedRef.current = true;
          push("system", result.summary ?? "Change applied.");
          onMutationRef.current?.();
        }

        responses.push({
          id: call.id,
          name: call.name,
          response: result as Record<string, unknown>,
        });
      }

      setActiveTool(null);
      sessionRef.current?.sendToolResponse({ functionResponses: responses });
    },
    [callTool, push],
  );

  /** Resolving the promise the tool bridge is parked on releases the write. */
  const approveWrite = useCallback(() => decisionRef.current?.(true), []);
  const cancelWrite = useCallback(() => decisionRef.current?.(false), []);

  const handleMessage = useCallback(
    (message: LiveServerMessage) => {
      if (message.setupComplete) setState("listening");

      const inputText = message.serverContent?.inputTranscription?.text;
      if (inputText) partialRef.current.user += inputText;

      const outputText = message.serverContent?.outputTranscription?.text;
      if (outputText) partialRef.current.agent += outputText;

      if (message.serverContent?.interrupted) {
        stopPlayback();
        setState("listening");
      }

      for (const part of message.serverContent?.modelTurn?.parts ?? []) {
        const audio = part.inlineData?.data;
        if (audio) {
          setState("speaking");
          playChunk(audio);
        }
      }

      if (message.serverContent?.turnComplete) {
        push("you", partialRef.current.user);
        push("agent", partialRef.current.agent);
        partialRef.current = { user: "", agent: "" };
        setState("listening");
      }

      if (message.toolCall) void handleToolCall(message);
    },
    [handleToolCall, playChunk, push, stopPlayback],
  );

  const start = useCallback(async () => {
    if (sessionRef.current) {
      stop();
      return;
    }

    setState("connecting");
    setDetail("Reading your boards");
    try {
      const response = await fetch("/api/agent/session", { method: "POST" });
      const payload = (await response.json()) as {
        token?: string;
        model?: string;
        sessionId?: string;
        error?: string;
      };
      if (!response.ok || !payload.token || !payload.model) {
        throw new Error(payload.error || "Could not start a voice session.");
      }

      setDetail("Opening the microphone");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      setDetail("Connecting to Gemini Live");
      // The ephemeral token replaces the API key and already pins the model,
      // prompt and tool list that the server minted it with.
      const ai = new GoogleGenAI({
        apiKey: payload.token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      const session = await ai.live.connect({
        model: payload.model,
        callbacks: {
          onopen: () => setState("listening"),
          onmessage: handleMessage,
          onerror: (event: ErrorEvent) => {
            setState("error");
            setDetail(event?.message || "The voice connection dropped.");
          },
          onclose: () => {
            // Gemini can close the session on its own (token expiry, network
            // drop), which never reaches `stop`. Settle here too so those
            // sessions are not left charged for their full lifetime.
            settleUsage();
            sessionRef.current = null;
            teardownAudio();
            setState("idle");
          },
        },
        config: {},
      });
      sessionRef.current = session;
      usageSessionRef.current = payload.sessionId ?? null;
      sessionStartedAtRef.current = Date.now();

      const context = new AudioContext({ sampleRate: INPUT_RATE });
      captureContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(CAPTURE_FRAMES, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        let peak = 0;
        for (let index = 0; index < input.length; index += 1) {
          peak = Math.max(peak, Math.abs(input[index]));
        }
        setInputLevel(peak);
        try {
          sessionRef.current?.sendRealtimeInput({
            audio: {
              data: encodeBase64(floatToPcm16(input)),
              mimeType: `audio/pcm;rate=${INPUT_RATE}`,
            },
          });
        } catch {
          // A closing socket drops the tail of a frame; the next start recovers.
        }
      };

      source.connect(processor);
      // Routed through a muted gain node so the processor keeps firing without
      // echoing the microphone back through the speakers.
      const silence = context.createGain();
      silence.gain.value = 0;
      processor.connect(silence);
      silence.connect(context.destination);

      setDetail("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start the voice agent.";
      setState("error");
      setDetail(message);
      teardownAudio();
      sessionRef.current = null;
    }
  }, [handleMessage, stop, teardownAudio, settleUsage]);

  /** Sends a typed line into the open voice session, keeping one thread of context. */
  const sendText = useCallback((text: string) => {
    if (!sessionRef.current || !text.trim()) return false;
    sessionRef.current.sendClientContent({
      turns: [{ role: "user", parts: [{ text: text.trim() }] }],
      turnComplete: true,
    });
    return true;
  }, []);

  return {
    state,
    detail,
    transcript,
    activeTool,
    inputLevel,
    outputLevel,
    isLive: state !== "idle" && state !== "error",
    pendingWrite,
    approveWrite,
    cancelWrite,
    start,
    stop,
    sendText,
  };
}
