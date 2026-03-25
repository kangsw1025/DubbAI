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

  const clipDuration = (startTime: number, endTime?: number) => {
    if (endTime !== undefined && endTime > startTime) {
      return Math.max(1, endTime - startTime);
    }
    return 60;
  };

  const extractErrorMessage = async (
    res: Response,
    fallback: string,
  ): Promise<string> => {
    try {
      const body = await res.json();
      if (body && typeof body.error === "string" && body.error.length > 0) {
        return body.error;
      }
    } catch {
      // noop
    }
    return fallback;
  };

  const dub = async (
    file: File,
    targetLanguage: string,
    startTime = 0,
    endTime?: number,
  ) => {
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
        // PC: ffmpeg.wasm으로 선택 구간 오디오 추출 + 합성
        await dubVideoPC(file, targetLanguage, startTime, endTime);
      } else if (!ios && captureOk) {
        // Android / 저사양: captureStream 클립 + 서버 mux
        await dubVideoAndroid(file, targetLanguage, startTime, endTime);
      } else if (ios) {
        try {
          // iOS 17+: 클라이언트 청크 스트리밍 클립 우선 시도
          await dubVideoIOSClientClip(file, targetLanguage, startTime, endTime);
        } catch {
          // 실패 시 기존 서버 세션 경로로 자동 폴백
          await dubVideoIOS(file, targetLanguage, startTime, endTime);
        }
      } else {
        // 기타 captureStream 미지원 환경: 서버 prepare + mux-session
        await dubVideoIOS(file, targetLanguage, startTime, endTime);
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

  /** PC: ffmpeg.wasm으로 선택 구간 오디오 추출 후 더빙 */
  const dubVideoPC = async (
    file: File,
    targetLanguage: string,
    startTime: number,
    endTime?: number,
  ) => {
    setStatus("extracting");
    const { extractAudioFromVideo } =
      await import("@/lib/utils/extractAudioClient");
    const audioFile = await extractAudioFromVideo(file, startTime, endTime);

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
      const finalVideo = await muxAudioToVideo(
        file,
        dubbedBlob,
        startTime,
        endTime,
      );
      setMediaUrlAndRevokePrev(URL.createObjectURL(finalVideo));
    } catch {
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
    endTime?: number,
  ) => {
    setStatus("clipping");
    const { clipVideo } = await import("@/lib/utils/clipVideo");
    const { videoBlob, audioBlob } = await clipVideo(file, startTime, endTime);

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
      setMediaUrlAndRevokePrev(URL.createObjectURL(dubbedBlob));
      setIsVideo(false);
    }

    setStatus("success");
  };

  /** iOS 17+: 클라이언트 1분 클립(청크 업로드) + 서버 mux */
  const dubVideoIOSClientClip = async (
    file: File,
    targetLanguage: string,
    startTime: number,
    endTime?: number,
  ) => {
    const { supportsIOSStreamClip, streamClipVideoIOS } = await import(
      "@/lib/utils/clipVideoIOSStream"
    );
    if (!supportsIOSStreamClip()) {
      throw new Error("iOS 클라이언트 클립 API 미지원");
    }

    const { extractAudioContext } = await import("@/lib/utils/extractAudioContext");
    const { url: muxUrl, token: muxToken } = await getMuxConfig();

    let clipSessionId: string | null = null;
    const requestHeaders = {
      Authorization: `Bearer ${muxToken}`,
    };

    const abortClipSession = async () => {
      if (!clipSessionId) return;
      try {
        await fetch(`${muxUrl}/clip-session/abort`, {
          method: "POST",
          headers: {
            ...requestHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId: clipSessionId }),
        });
      } catch {
        // noop
      }
    };

    try {
      setStatus("clipping");
      const initRes = await fetch(`${muxUrl}/clip-session/init`, {
        method: "POST",
        headers: {
          ...requestHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ container: "mp4" }),
      });
      if (!initRes.ok) {
        throw new Error(await extractErrorMessage(initRes, "클립 세션 시작 실패"));
      }

      const initData = (await initRes.json()) as { sessionId?: string };
      if (!initData.sessionId) {
        throw new Error("클립 세션 ID를 받지 못했습니다.");
      }
      clipSessionId = initData.sessionId;

      const clipInfo = await streamClipVideoIOS(
        file,
        startTime,
        endTime,
        async (chunk, seq) => {
          const chunkFormData = new FormData();
          chunkFormData.append("sessionId", clipSessionId as string);
          chunkFormData.append("seq", String(seq));
          chunkFormData.append(
            "chunk",
            new File([chunk], `chunk-${seq}.bin`, {
              type: chunk.type || "application/octet-stream",
            }),
          );

          const chunkRes = await fetch(`${muxUrl}/clip-session/chunk`, {
            method: "POST",
            headers: requestHeaders,
            body: chunkFormData,
          });
          if (!chunkRes.ok) {
            throw new Error(
              await extractErrorMessage(chunkRes, "클립 청크 업로드 실패"),
            );
          }
        },
      );

      const completeRes = await fetch(`${muxUrl}/clip-session/complete`, {
        method: "POST",
        headers: {
          ...requestHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: clipSessionId,
          totalChunks: clipInfo.totalChunks,
          container: clipInfo.container,
        }),
      });
      if (!completeRes.ok) {
        throw new Error(
          await extractErrorMessage(completeRes, "클립 업로드 완료 처리 실패"),
        );
      }

      setStatus("extracting");
      const audioBlob = await extractAudioContext(
        file,
        startTime,
        clipInfo.durationSec || clipDuration(startTime, endTime),
      );

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

      setStatus("muxing");
      const muxFormData = new FormData();
      muxFormData.append(
        "audio",
        new File([dubbedBlob], "dubbed.mp3", { type: "audio/mpeg" }),
      );
      muxFormData.append("sessionId", clipSessionId as string);

      const muxRes = await fetch(`${muxUrl}/mux-clip-session`, {
        method: "POST",
        headers: requestHeaders,
        body: muxFormData,
      });
      if (!muxRes.ok) {
        throw new Error(await extractErrorMessage(muxRes, "mux 실패"));
      }

      const mimeType = muxRes.headers.get("Content-Type") ?? "video/mp4";
      const muxedBuffer = await muxRes.arrayBuffer();
      const muxedBlob = new Blob([muxedBuffer], { type: mimeType });
      setMediaUrlAndRevokePrev(URL.createObjectURL(muxedBlob));
      setStatus("success");
    } catch (err) {
      await abortClipSession();
      throw err;
    }
  };

  /** iOS: 원본 영상 1회 업로드 → /prepare → STT+TTS → /mux-session */
  const dubVideoIOS = async (
    file: File,
    targetLanguage: string,
    startTime: number,
    endTime?: number,
  ) => {
    const { url: muxUrl, token: muxToken } = await getMuxConfig();

    // 1단계: Railway /prepare — 영상 1회 업로드, 오디오 추출 + 세션 보관
    setStatus("extracting");
    const prepareFormData = new FormData();
    prepareFormData.append("video", file);
    prepareFormData.append("startTime", String(startTime));
    if (endTime !== undefined && endTime > startTime) {
      prepareFormData.append("endTime", String(endTime));
    }

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
      if (endTime !== undefined && endTime > startTime) {
        muxFormData.append("endTime", String(endTime));
      }

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
