"use client";

import { useState } from "react";
import type { DubbingResult, DubbingStatus } from "@/types";

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
      if (fileIsVideo) {
        await dubVideoFile(file, targetLanguage, startTime);
      } else {
        await dubAudioFile(file, targetLanguage);
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

  /** 비디오 파일: Server Action으로 더빙 영상 생성 (200MB 업로드 지원) */
  const dubVideoFile = async (
    file: File,
    targetLanguage: string,
    startTime: number,
  ) => {
    setStatus("processing");

    const { dubVideoAction } = await import("@/lib/actions/dubVideo");

    const formData = new FormData();
    formData.append("video", file);
    formData.append("targetLanguage", targetLanguage);
    if (startTime > 0) {
      formData.append("startTime", String(startTime));
    }

    const result = await dubVideoAction(formData);

    setResult({ transcript: result.transcript, translation: result.translation });

    const videoBytes = Uint8Array.from(atob(result.videoBase64), (c) =>
      c.charCodeAt(0),
    );
    const videoBlob = new Blob([videoBytes], { type: result.mimeType });
    setMediaUrl(URL.createObjectURL(videoBlob));
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
