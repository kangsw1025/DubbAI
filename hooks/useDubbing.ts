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
        // 1단계: 최대 60초로 클립 + 오디오 동시 추출 (WASM 없음)
        setStatus("clipping");
        const { clipVideo } = await import("@/lib/utils/clipVideo");
        const { videoBlob, audioBlob } = await clipVideo(file, startTime);

        // 2단계: 오디오를 서버로 전송해 더빙
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
        if (!res.ok)
          throw new Error(data.error || "더빙 중 오류가 발생했습니다.");

        setResult(data);

        const audioBytes = Uint8Array.from(atob(data.audio), (c) =>
          c.charCodeAt(0),
        );
        const dubbedBlob = new Blob([audioBytes], { type: "audio/mpeg" });

        // 3단계: 클립 + 더빙 오디오 합성 (WASM)
        setStatus("muxing");
        const videoFile = new File([videoBlob], "clip.webm", {
          type: videoBlob.type,
        });
        try {
          const { muxAudioToVideo } =
            await import("@/lib/utils/muxAudioToVideo");
          const finalVideo = await muxAudioToVideo(videoFile, dubbedBlob);
          setMediaUrl(URL.createObjectURL(finalVideo));
        } catch {
          // mux 실패 시 오디오만 제공
          setMediaUrl(URL.createObjectURL(dubbedBlob));
          setIsVideo(false);
        }
      } else {
        // 오디오 파일: 기존 흐름 유지
        const formData = new FormData();
        formData.append("file", file);
        formData.append("targetLanguage", targetLanguage);

        const res = await fetch("/api/dub", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "더빙 중 오류가 발생했습니다.");

        setResult(data);
        const audioBytes = Uint8Array.from(atob(data.audio), (c) =>
          c.charCodeAt(0),
        );
        const dubbedBlob = new Blob([audioBytes], { type: "audio/mpeg" });
        setMediaUrl(URL.createObjectURL(dubbedBlob));
      }

      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      setStatus("error");
    }
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
