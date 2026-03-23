"use client";

import { useState } from "react";
import type { DubbingResult, DubbingStatus } from "@/types";
import {
  isIOS,
  isAndroid,
  supportsCaptureStream,
  isLowMemoryDevice,
} from "@/lib/utils/deviceDetect";

export function useDubbing() {
  const [status, setStatus] = useState<DubbingStatus>("idle");
  const [result, setResult] = useState<DubbingResult | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setMediaUrlAndRevokePrev = (url: string | null) => {
    setMediaUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  };

  const dub = async (file: File, targetLanguage: string, startTime = 0) => {
    setStatus("processing");
    setError(null);
    setResult(null);
    setMediaUrlAndRevokePrev(null);

    const fileIsVideo = file.type.startsWith("video/");
    setIsVideo(fileIsVideo);

    try {
      if (!fileIsVideo) {
        await dubAudioFile(file, targetLanguage);
        return;
      }

      const ios = isIOS();
      const android = isAndroid();
      const captureOk = supportsCaptureStream();
      const lowMem = isLowMemoryDevice();

      if (!ios && captureOk && !lowMem && !android) {
        // PC: ffmpeg.wasm으로 전체 오디오 추출 (클립 없음)
        await dubVideoPC(file, targetLanguage);
      } else if (!ios && captureOk) {
        // Android / 저사양: captureStream 클립 + 서버 mux
        await dubVideoAndroid(file, targetLanguage, startTime);
      } else {
        // iOS (또는 captureStream 미지원): AudioContext + 서버 mux
        await dubVideoIOS(file, targetLanguage, startTime);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      setStatus("error");
    }
  };

  async function getMuxConfig(): Promise<{ url: string; token: string }> {
    const res = await fetch("/api/mux-token");
    if (!res.ok) throw new Error("mux 서버 설정을 불러오지 못했습니다.");
    return res.json();
  }

  /** 오디오 파일: 모든 디바이스 동일 */
  const dubAudioFile = async (file: File, targetLanguage: string) => {
    setStatus("processing");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("targetLanguage", targetLanguage);

    const res = await fetch("/api/dub", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "더빙 중 오류가 발생했습니다.");

    setResult(data);
    const audioBytes = Uint8Array.from(atob(data.audio), (c) =>
      c.charCodeAt(0),
    );
    const dubbedBlob = new Blob([audioBytes], { type: "audio/mpeg" });
    setMediaUrlAndRevokePrev(URL.createObjectURL(dubbedBlob));
    setIsVideo(false);
    setStatus("success");
  };

  /** PC: ffmpeg.wasm으로 전체 오디오 추출 후 더빙 (클립 없음) */
  const dubVideoPC = async (file: File, targetLanguage: string) => {
    setStatus("extracting");
    const { extractAudioFromVideo } =
      await import("@/lib/utils/extractAudioClient");
    const audioFile = await extractAudioFromVideo(file);

    setStatus("processing");
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("targetLanguage", targetLanguage);

    const res = await fetch("/api/dub", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "더빙 중 오류가 발생했습니다.");

    setResult(data);

    const audioBytes = Uint8Array.from(atob(data.audio), (c) =>
      c.charCodeAt(0),
    );
    const dubbedBlob = new Blob([audioBytes], { type: "audio/mpeg" });

    setStatus("muxing");
    try {
      const { muxAudioToVideo } = await import("@/lib/utils/muxAudioToVideo");
      const finalVideo = await muxAudioToVideo(file, dubbedBlob);
      setMediaUrlAndRevokePrev(URL.createObjectURL(finalVideo));
    } catch {
      // ffmpeg.wasm 실패 시 오디오만 제공
      setMediaUrlAndRevokePrev(URL.createObjectURL(dubbedBlob));
      setIsVideo(false);
    }

    setStatus("success");
  };

  /** Android: captureStream 클립 + 서버 mux (ffmpeg.wasm 없음) */
  const dubVideoAndroid = async (
    file: File,
    targetLanguage: string,
    startTime: number,
  ) => {
    setStatus("clipping");
    const { clipVideo } = await import("@/lib/utils/clipVideo");
    const { videoBlob, audioBlob } = await clipVideo(file, startTime);

    setStatus("processing");
    const audioFile = new File(
      [audioBlob],
      `audio.${audioBlob.type.includes("ogg") ? "ogg" : "webm"}`,
      { type: audioBlob.type },
    );
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("targetLanguage", targetLanguage);

    const res = await fetch("/api/dub", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "더빙 중 오류가 발생했습니다.");

    setResult(data);

    const audioBytes = Uint8Array.from(atob(data.audio), (c) =>
      c.charCodeAt(0),
    );
    const dubbedBlob = new Blob([audioBytes], { type: "audio/mpeg" });

    setStatus("muxing");
    const videoClip = new File([videoBlob], "clip.webm", {
      type: videoBlob.type,
    });

    try {
      const { url: muxUrl, token: muxToken } = await getMuxConfig();

      const muxFormData = new FormData();
      muxFormData.append("video", videoClip);
      muxFormData.append(
        "audio",
        new File([dubbedBlob], "dubbed.mp3", { type: "audio/mpeg" }),
      );

      const muxRes = await fetch(`${muxUrl}/mux`, {
        method: "POST",
        headers: { Authorization: `Bearer ${muxToken}` },
        body: muxFormData,
      });

      if (!muxRes.ok) throw new Error("mux 실패");

      const mimeType = muxRes.headers.get("Content-Type") ?? "video/mp4";
      const muxedBuffer = await muxRes.arrayBuffer();
      const muxedBlob = new Blob([muxedBuffer], { type: mimeType });
      setMediaUrlAndRevokePrev(URL.createObjectURL(muxedBlob));
    } catch {
      // mux 실패 시 오디오만 제공
      setMediaUrlAndRevokePrev(URL.createObjectURL(dubbedBlob));
      setIsVideo(false);
    }

    setStatus("success");
  };

  /** iOS: 원본 영상 1회 업로드 → /prepare → STT+TTS → /mux-session */
  const dubVideoIOS = async (
    file: File,
    targetLanguage: string,
    startTime: number,
  ) => {
    const { url: muxUrl, token: muxToken } = await getMuxConfig();

    // 1단계: Railway /prepare — 영상 1회 업로드, 오디오 추출 + 세션 보관
    setStatus("extracting");
    const prepareFormData = new FormData();
    prepareFormData.append("video", file);
    prepareFormData.append("startTime", String(startTime));

    const prepareRes = await fetch(`${muxUrl}/prepare`, {
      method: "POST",
      headers: { Authorization: `Bearer ${muxToken}` },
      body: prepareFormData,
    });
    if (!prepareRes.ok) throw new Error("오디오 추출 실패");

    const sessionId = prepareRes.headers.get("X-Session-Id");
    if (!sessionId) throw new Error("세션 ID를 받지 못했습니다.");
    const audioBlob = await prepareRes.blob();

    // 2단계: Vercel STT + 번역 + TTS
    setStatus("processing");
    const audioFile = new File([audioBlob], "audio.mp3", {
      type: "audio/mpeg",
    });
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("targetLanguage", targetLanguage);

    const res = await fetch("/api/dub", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "더빙 중 오류가 발생했습니다.");

    setResult(data);

    const audioBytes = Uint8Array.from(atob(data.audio), (c) =>
      c.charCodeAt(0),
    );
    const dubbedBlob = new Blob([audioBytes], { type: "audio/mpeg" });

    // 3단계: Railway /mux-session — 더빙 오디오(작은 mp3)만 전송
    setStatus("muxing");
    try {
      const muxFormData = new FormData();
      muxFormData.append(
        "audio",
        new File([dubbedBlob], "dubbed.mp3", { type: "audio/mpeg" }),
      );
      muxFormData.append("sessionId", sessionId);
      muxFormData.append("startTime", String(startTime));

      const muxRes = await fetch(`${muxUrl}/mux-session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${muxToken}` },
        body: muxFormData,
      });

      if (!muxRes.ok) throw new Error("mux 실패");

      const mimeType = muxRes.headers.get("Content-Type") ?? "video/mp4";
      const muxedBuffer = await muxRes.arrayBuffer();
      const muxedBlob = new Blob([muxedBuffer], { type: mimeType });
      setMediaUrlAndRevokePrev(URL.createObjectURL(muxedBlob));
    } catch {
      // mux 실패 시 오디오만 제공
      setMediaUrlAndRevokePrev(URL.createObjectURL(dubbedBlob));
      setIsVideo(false);
    }

    setStatus("success");
  };

  const reset = () => {
    setStatus("idle");
    setResult(null);
    setMediaUrlAndRevokePrev(null);
    setIsVideo(false);
    setError(null);
  };

  return { status, result, mediaUrl, isVideo, error, dub, reset };
}
