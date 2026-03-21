"use client";

import { useState } from "react";
import type { DubbingResult, DubbingStatus } from "@/types";
import {
  isIOS,
  isAndroid,
  supportsCaptureStream,
  isLowMemoryDevice,
} from "@/lib/utils/deviceDetect";

/** iOS에서 서버 mux 없이 오디오만 제공하는 파일 크기 임계값 (200MB) */
const MAX_IOS_VIDEO_SIZE = 200 * 1024 * 1024;

export function useDubbing() {
  const [status, setStatus] = useState<DubbingStatus>("idle");
  const [result, setResult] = useState<DubbingResult | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dub = async (file: File, targetLanguage: string, startTime = 0) => {
    setStatus("processing");
    setError(null);
    setResult(null);
    setMediaUrl(null);

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
        // PC: 기존 방식 (captureStream + ffmpeg.wasm)
        await dubVideoPC(file, targetLanguage, startTime);
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
    setMediaUrl(URL.createObjectURL(dubbedBlob));
    setIsVideo(false);
    setStatus("success");
  };

  /** PC: captureStream + ffmpeg.wasm (기존 방식 그대로) */
  const dubVideoPC = async (
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
    const videoFile = new File([videoBlob], "clip.webm", {
      type: videoBlob.type,
    });
    try {
      const { muxAudioToVideo } = await import("@/lib/utils/muxAudioToVideo");
      const finalVideo = await muxAudioToVideo(videoFile, dubbedBlob);
      setMediaUrl(URL.createObjectURL(finalVideo));
    } catch {
      // ffmpeg.wasm 실패 시 오디오만 제공
      setMediaUrl(URL.createObjectURL(dubbedBlob));
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
    const videoFile = new File([videoBlob], "clip.webm", {
      type: videoBlob.type,
    });

    try {
      const muxFormData = new FormData();
      muxFormData.append("video", videoFile);
      muxFormData.append(
        "audio",
        new File([dubbedBlob], "dubbed.mp3", { type: "audio/mpeg" }),
      );

      const muxRes = await fetch("/api/mux", {
        method: "POST",
        body: muxFormData,
      });

      if (!muxRes.ok) throw new Error("mux 실패");

      const mimeType = muxRes.headers.get("Content-Type") ?? "video/mp4";
      const muxedBuffer = await muxRes.arrayBuffer();
      const muxedBlob = new Blob([muxedBuffer], { type: mimeType });
      setMediaUrl(URL.createObjectURL(muxedBlob));
    } catch {
      // mux 실패 시 오디오만 제공
      setMediaUrl(URL.createObjectURL(dubbedBlob));
      setIsVideo(false);
    }

    setStatus("success");
  };

  /** iOS: AudioContext 오디오 추출 + 서버 mux */
  const dubVideoIOS = async (
    file: File,
    targetLanguage: string,
    startTime: number,
  ) => {
    // 1단계: AudioContext로 오디오 추출 (captureStream 없이)
    setStatus("extracting");
    const { extractAudioContext } =
      await import("@/lib/utils/extractAudioContext");
    const audioBlob = await extractAudioContext(file, startTime);

    // 2단계: 서버에서 STT + 번역 + TTS
    setStatus("processing");
    const audioFile = new File(
      [audioBlob],
      `audio.${audioBlob.type.includes("mp4") ? "mp4" : "webm"}`,
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

    // 3단계: 원본 비디오를 서버로 보내 클립 + mux
    // 파일이 너무 크면 오디오만 제공
    if (file.size > MAX_IOS_VIDEO_SIZE) {
      setMediaUrl(URL.createObjectURL(dubbedBlob));
      setIsVideo(false);
      setStatus("success");
      return;
    }

    setStatus("muxing");
    try {
      const muxFormData = new FormData();
      muxFormData.append("video", file);
      muxFormData.append(
        "audio",
        new File([dubbedBlob], "dubbed.mp3", { type: "audio/mpeg" }),
      );
      muxFormData.append("startTime", String(startTime));

      const muxRes = await fetch("/api/mux", {
        method: "POST",
        body: muxFormData,
      });

      if (!muxRes.ok) throw new Error("mux 실패");

      const mimeType = muxRes.headers.get("Content-Type") ?? "video/mp4";
      const muxedBuffer = await muxRes.arrayBuffer();
      const muxedBlob = new Blob([muxedBuffer], { type: mimeType });
      setMediaUrl(URL.createObjectURL(muxedBlob));
    } catch {
      // mux 실패 시 오디오만 제공
      setMediaUrl(URL.createObjectURL(dubbedBlob));
      setIsVideo(false);
    }

    setStatus("success");
  };

  const reset = () => {
    setStatus("idle");
    setResult(null);
    setMediaUrl(null);
    setIsVideo(false);
    setError(null);
  };

  return { status, result, mediaUrl, isVideo, error, dub, reset };
}
