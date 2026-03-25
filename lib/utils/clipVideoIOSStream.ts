"use client";

import { CLIP_SECONDS } from "./clipVideo";

export interface IOSStreamClipResult {
  container: "mp4" | "webm";
  mimeType: string;
  totalChunks: number;
  durationSec: number;
}

function supportsCanvasCaptureStream(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  return typeof canvas.captureStream === "function";
}

function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;

  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? null;
}

function inferContainer(mimeType: string): "mp4" | "webm" {
  return mimeType.includes("webm") ? "webm" : "mp4";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function scaledSize(width: number, height: number, maxLongEdge = 1280) {
  const longEdge = Math.max(width, height);
  if (!Number.isFinite(longEdge) || longEdge <= maxLongEdge) {
    return { width, height };
  }

  const ratio = maxLongEdge / longEdge;
  return {
    width: Math.max(2, Math.floor((width * ratio) / 2) * 2),
    height: Math.max(2, Math.floor((height * ratio) / 2) * 2),
  };
}

export function supportsIOSStreamClip(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    supportsCanvasCaptureStream() &&
    pickRecorderMimeType() !== null
  );
}

export async function streamClipVideoIOS(
  file: File,
  startTime = 0,
  endTime: number | undefined,
  onChunk: (chunk: Blob, seq: number) => Promise<void>,
  options?: { fps?: number; timesliceMs?: number },
): Promise<IOSStreamClipResult> {
  const mimeType = pickRecorderMimeType();
  if (!mimeType || !supportsCanvasCaptureStream()) {
    throw new Error("iOS 클라이언트 클립 API를 지원하지 않습니다.");
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("Canvas context 생성 실패");
  }

  const fps = options?.fps ?? 24;
  const timesliceMs = options?.timesliceMs ?? 800;

  return new Promise<IOSStreamClipResult>((resolve, reject) => {
    let uploadChain = Promise.resolve();
    let totalChunks = 0;
    let activeStream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let rafId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const cleanup = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (recorder && recorder.state !== "inactive") recorder.stop();
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
        activeStream = null;
      }

      video.pause();
      video.removeAttribute("src");
      video.src = "";
      URL.revokeObjectURL(objectUrl);
    };

    const fail = (err: Error) => {
      if (done) return;
      done = true;
      cleanup();
      reject(err);
    };

    const stopRecorder = () => {
      if (!recorder || recorder.state === "inactive") return;
      recorder.stop();
      video.pause();
    };

    const drawLoop = (clipEndTime: number) => {
      if (done) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (video.currentTime >= clipEndTime || video.ended) {
        stopRecorder();
        return;
      }
      rafId = requestAnimationFrame(() => drawLoop(clipEndTime));
    };

    video.addEventListener(
      "error",
      () => fail(new Error("비디오 로드 실패")),
      { once: true },
    );

    video.addEventListener(
      "loadedmetadata",
      () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const clipStart = clamp(startTime, 0, Math.max(duration - 0.1, 0));
        const clipEnd =
          endTime !== undefined && endTime > clipStart
            ? Math.min(endTime, duration || clipStart + CLIP_SECONDS)
            : clipStart +
              Math.min(
                CLIP_SECONDS,
                duration > clipStart ? duration - clipStart : CLIP_SECONDS,
              );
        const clipDuration = Math.max(0.5, clipEnd - clipStart);

        const sourceWidth = Math.max(video.videoWidth || 640, 2);
        const sourceHeight = Math.max(video.videoHeight || 360, 2);
        const scaled = scaledSize(sourceWidth, sourceHeight);
        canvas.width = scaled.width;
        canvas.height = scaled.height;

        activeStream = canvas.captureStream(fps);

        try {
          recorder = new MediaRecorder(activeStream, { mimeType });
        } catch {
          fail(new Error("MediaRecorder 생성 실패"));
          return;
        }

        recorder.ondataavailable = (event) => {
          if (event.data.size <= 0) return;
          const seq = totalChunks++;
          uploadChain = uploadChain.then(() => onChunk(event.data, seq));
        };

        recorder.onerror = () => {
          fail(new Error("iOS 클립 녹화 실패"));
        };

        recorder.onstop = () => {
          uploadChain
            .then(() => {
              if (done) return;
              done = true;
              if (activeStream) {
                activeStream.getTracks().forEach((track) => track.stop());
                activeStream = null;
              }
              if (rafId !== null) cancelAnimationFrame(rafId);
              if (timeoutId !== null) clearTimeout(timeoutId);
              video.pause();
              video.removeAttribute("src");
              video.src = "";
              URL.revokeObjectURL(objectUrl);
              resolve({
                container: inferContainer(mimeType),
                mimeType,
                totalChunks,
                durationSec: clipDuration,
              });
            })
            .catch((err) => {
              fail(err instanceof Error ? err : new Error("청크 업로드 실패"));
            });
        };

        const startRecording = () => {
          if (!recorder) return;
          recorder.start(timesliceMs);
          video.play().catch(() => {
            fail(new Error("비디오 재생 실패"));
          });
          drawLoop(clipEnd);
          timeoutId = setTimeout(stopRecorder, (clipDuration + 5) * 1000);
        };

        if (clipStart > 0) {
          video.currentTime = clipStart;
          video.addEventListener("seeked", startRecording, { once: true });
        } else {
          startRecording();
        }
      },
      { once: true },
    );
  });
}
