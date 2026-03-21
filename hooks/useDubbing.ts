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

      if (!ios && !android && captureOk && !lowMem) {
        // PC: 기존 방식 (captureStream + ffmpeg.wasm)
        await dubVideoPC(file, targetLanguage, startTime);
      } else {
        // 모바일 (Android + iOS): 통합 경량 경로 (서버 mux 없음)
        await dubVideoMobile(file, targetLanguage, startTime);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      setStatus("error");
    }
  };

  /** 서버 더빙 요청 → 바이너리 오디오 + 헤더에서 텍스트 추출 */
  const fetchDub = async (formData: FormData) => {
    const res = await fetch("/api/dub", { method: "POST", body: formData });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        (data as { error?: string }).error || "더빙 중 오류가 발생했습니다.",
      );
    }

    const transcript = decodeURIComponent(
      res.headers.get("X-Transcript") ?? "",
    );
    const translation = decodeURIComponent(
      res.headers.get("X-Translation") ?? "",
    );
    const dubbedBlob = await res.blob();

    setResult({ transcript, translation });
    return dubbedBlob;
  };

  /** 오디오 파일: 모든 디바이스 동일 */
  const dubAudioFile = async (file: File, targetLanguage: string) => {
    setStatus("processing");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("targetLanguage", targetLanguage);

    const dubbedBlob = await fetchDub(formData);
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

    const dubbedBlob = await fetchDub(formData);

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

  /** 모바일 (Android + iOS): 오디오만 추출 후 클라이언트 mux (서버 mux 없음) */
  const dubVideoMobile = async (
    file: File,
    targetLanguage: string,
    startTime: number,
  ) => {
    // 1단계: 오디오만 추출 (비디오 청크 없음 = 저메모리)
    setStatus("extracting");
    const captureOk = supportsCaptureStream();

    let audioBlob: Blob;
    if (captureOk) {
      // Android / 대부분 기기: captureStream 오디오 전용 추출
      const { extractAudioFromVideo } = await import("@/lib/utils/clipVideo");
      audioBlob = await extractAudioFromVideo(file, startTime);
    } else {
      // iOS: AudioContext 폴백
      const { extractAudioContext } = await import(
        "@/lib/utils/extractAudioContext"
      );
      audioBlob = await extractAudioContext(file, startTime);
    }

    // 2단계: STT → 번역 → TTS
    setStatus("processing");
    const audioFile = new File(
      [audioBlob],
      `audio.${audioBlob.type.includes("ogg") ? "ogg" : "webm"}`,
      { type: audioBlob.type },
    );
    audioBlob = null as unknown as Blob; // 추출 오디오 즉시 해제
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("targetLanguage", targetLanguage);

    const dubbedBlob = await fetchDub(formData);

    // 3단계: 클라이언트 사이드 mux (서버 불필요)
    setStatus("muxing");
    try {
      const { muxWithMediaRecorder } = await import(
        "@/lib/utils/muxWithMediaRecorder"
      );
      const finalVideo = await muxWithMediaRecorder(file, dubbedBlob, startTime);
      setMediaUrl(URL.createObjectURL(finalVideo));
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
