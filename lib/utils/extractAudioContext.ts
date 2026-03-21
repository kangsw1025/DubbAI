"use client";

import { CLIP_SECONDS } from "./clipVideo";

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/**
 * AudioContext + MediaRecorder를 이용해 비디오/오디오 파일에서
 * 지정 구간(startTime ~ startTime+CLIP_SECONDS)의 오디오를 추출합니다.
 *
 * captureStream() 없이 동작하므로 iOS Safari 포함 전 브라우저에서 사용 가능합니다.
 * 실시간 재생 기반이므로 CLIP_SECONDS 만큼 시간이 소요됩니다.
 */
export function extractAudioContext(
  file: File,
  startTime = 0,
  durationSec = CLIP_SECONDS,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audioEl = new Audio();
    audioEl.src = url;
    audioEl.crossOrigin = "anonymous";

    const cleanup = () => URL.revokeObjectURL(url);

    audioEl.addEventListener("error", () => {
      cleanup();
      reject(new Error("오디오 로드 실패"));
    });

    audioEl.addEventListener(
      "canplay",
      () => {
        let ctx: AudioContext;
        try {
          const AudioCtx =
            window.AudioContext || (window as WebkitWindow).webkitAudioContext;
          if (!AudioCtx) throw new Error("AudioContext 미지원");
          ctx = new AudioCtx();
        } catch {
          cleanup();
          reject(new Error("AudioContext 생성 실패"));
          return;
        }

        const dest = ctx.createMediaStreamDestination();
        const source = ctx.createMediaElementSource(audioEl);
        source.connect(dest);
        // 스피커로 출력하지 않음 (ctx.destination 연결 제외)

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "audio/webm";

        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(dest.stream, { mimeType });
        } catch {
          cleanup();
          ctx.close();
          reject(new Error("MediaRecorder 생성 실패"));
          return;
        }

        const chunks: BlobPart[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          cleanup();
          ctx.close();
          resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
        };

        recorder.onerror = () => {
          cleanup();
          ctx.close();
          reject(new Error("오디오 녹음 실패"));
        };

        const endTime = startTime + durationSec;

        audioEl.addEventListener("timeupdate", () => {
          if (
            audioEl.currentTime >= endTime &&
            recorder.state !== "inactive"
          ) {
            recorder.stop();
            audioEl.pause();
          }
        });

        audioEl.addEventListener("ended", () => {
          if (recorder.state !== "inactive") recorder.stop();
        });

        const startRecording = () => {
          recorder.start(200);
          audioEl.play().catch(() => {
            cleanup();
            ctx.close();
            reject(new Error("재생 실패"));
          });
        };

        if (startTime > 0) {
          audioEl.currentTime = startTime;
          audioEl.addEventListener("seeked", startRecording, { once: true });
        } else {
          startRecording();
        }
      },
      { once: true },
    );

    audioEl.load();
  });
}
