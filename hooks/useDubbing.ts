"use client";

import { useState } from "react";
import type { DubbingResult, DubbingStatus } from "@/types";

export function useDubbing() {
  const [status, setStatus] = useState<DubbingStatus>("idle");
  const [result, setResult] = useState<DubbingResult | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dub = async (file: File, targetLanguage: string) => {
    setStatus("processing");
    setError(null);
    setResult(null);
    setMediaUrl(null);

    const fileIsVideo = file.type.startsWith("video/");
    setIsVideo(fileIsVideo);

    let audioFile = file;
    if (fileIsVideo) {
      setStatus("extracting");
      try {
        const { extractAudioFromVideo } = await import(
          "@/lib/utils/extractAudioClient"
        );
        audioFile = await extractAudioFromVideo(file);
      } catch {
        setError("비디오에서 오디오 추출에 실패했습니다.");
        setStatus("error");
        return;
      }
      setStatus("processing");
    }

    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("targetLanguage", targetLanguage);

    try {
      const res = await fetch("/api/dub", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "더빙 중 오류가 발생했습니다.");
      }

      setResult(data);

      const audioBytes = Uint8Array.from(atob(data.audio), (c) =>
        c.charCodeAt(0),
      );
      const dubbedBlob = new Blob([audioBytes], { type: "audio/mpeg" });

      if (fileIsVideo) {
        setStatus("muxing");
        try {
          const { muxAudioToVideo } = await import(
            "@/lib/utils/muxAudioToVideo"
          );
          const videoFile = await muxAudioToVideo(file, dubbedBlob);
          setMediaUrl(URL.createObjectURL(videoFile));
        } catch {
          // muxing 실패 시 오디오만 제공
          setMediaUrl(URL.createObjectURL(dubbedBlob));
          setIsVideo(false);
        }
      } else {
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
