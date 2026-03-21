"use client";

const pickMime = (types: string[], fallback: string): string =>
  types.find((t) => MediaRecorder.isTypeSupported(t)) ?? fallback;

function getVideoCapture(
  video: HTMLVideoElement,
): (() => MediaStream) | null {
  if ("captureStream" in video)
    return () =>
      (video as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
  if ("mozCaptureStream" in video)
    return () =>
      (video as HTMLVideoElement & { mozCaptureStream(): MediaStream }).mozCaptureStream();
  return null;
}

function buildCanvasCaptureStream(
  video: HTMLVideoElement,
): { stream: MediaStream; stopDrawing: () => void } {
  if (!("captureStream" in document.createElement("canvas"))) {
    throw new Error("이 브라우저에서는 영상 합성을 지원하지 않습니다.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 360;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context를 생성할 수 없습니다.");

  let rafId = 0;
  const draw = () => {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    rafId = requestAnimationFrame(draw);
  };
  draw();

  const stream = (
    canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }
  ).captureStream(30);

  return {
    stream,
    stopDrawing: () => cancelAnimationFrame(rafId),
  };
}

function buildAudioStream(
  audioBlob: Blob,
  audioCtx: AudioContext,
): { audioElement: HTMLAudioElement; audioObjectUrl: string; destination: MediaStreamAudioDestinationNode } {
  const audioObjectUrl = URL.createObjectURL(audioBlob);
  const audioElement = document.createElement("audio");
  audioElement.src = audioObjectUrl;
  audioElement.preload = "auto";

  const source = audioCtx.createMediaElementSource(audioElement);
  const destination = audioCtx.createMediaStreamDestination();
  source.connect(destination);

  return { audioElement, audioObjectUrl, destination };
}

export function muxWithMediaRecorder(
  videoFile: File,
  dubbedAudioBlob: Blob,
  startTime = 0,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const videoObjectUrl = URL.createObjectURL(videoFile);
    const video = document.createElement("video");
    video.src = videoObjectUrl;
    video.muted = true;
    video.playsInline = true;

    let audioCtx: AudioContext | null = null;
    let audioObjectUrl: string | null = null;
    let audioElement: HTMLAudioElement | null = null;
    let mediaRecorder: MediaRecorder | null = null;
    let stopDrawing: (() => void) | null = null;
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(videoObjectUrl);
      if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
      if (stopDrawing) stopDrawing();
      if (audioCtx && audioCtx.state !== "closed") audioCtx.close();
      video.pause();
      video.src = "";
      if (audioElement) {
        audioElement.pause();
        audioElement.src = "";
      }
    };

    const settle = (result: File | Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    };

    video.addEventListener("error", () => {
      settle(new Error("비디오 로드 실패"));
    });

    const startRecording = () => {
      try {
        audioCtx = new AudioContext();
        if (audioCtx.state === "suspended") {
          audioCtx.resume();
        }

        const getCaptureStream = getVideoCapture(video);

        let videoStream: MediaStream;

        if (getCaptureStream) {
          videoStream = getCaptureStream();
        } else {
          // iOS Safari fallback: draw frames onto canvas
          const canvasResult = buildCanvasCaptureStream(video);
          videoStream = canvasResult.stream;
          stopDrawing = canvasResult.stopDrawing;
        }

        const audioResult = buildAudioStream(dubbedAudioBlob, audioCtx);
        audioElement = audioResult.audioElement;
        audioObjectUrl = audioResult.audioObjectUrl;
        const { destination } = audioResult;

        const videoTracks = videoStream.getVideoTracks();
        const audioTracks = destination.stream.getAudioTracks();
        const combinedStream = new MediaStream([...videoTracks, ...audioTracks]);

        const mimeType = pickMime(
          ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"],
          "video/webm",
        );

        mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
        const chunks: BlobPart[] = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const ext = mimeType.includes("mp4") ? "mp4" : "webm";
          const outputType = mimeType.split(";")[0];
          const blob = new Blob(chunks, { type: outputType });
          settle(new File([blob], `dubbed.${ext}`, { type: outputType }));
        };

        mediaRecorder.onerror = () => {
          settle(new Error("미디어 레코더 오류"));
        };

        const stopAll = () => {
          if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
          }
          if (audioElement) audioElement.pause();
          video.pause();
        };

        audioElement.addEventListener("ended", stopAll);
        audioElement.addEventListener("error", () => {
          settle(new Error("오디오 로드 실패"));
        });

        // Safety timeout: audio duration + 5s buffer
        audioElement.addEventListener("loadedmetadata", () => {
          const audioDuration = audioElement!.duration;
          if (isFinite(audioDuration)) {
            setTimeout(stopAll, (audioDuration + 5) * 1000);
          }
        });

        // Stop recording when video ends
        video.addEventListener("ended", stopAll);

        // Hard safety timeout: 5 minutes maximum
        const HARD_TIMEOUT_MS = 300_000;
        setTimeout(() => settle(new Error("처리 시간 초과")), HARD_TIMEOUT_MS);

        mediaRecorder.start(500);

        video.play().catch(() => {
          settle(new Error("비디오 재생 실패"));
        });

        audioElement.play().catch(() => {
          settle(new Error("오디오 재생 실패"));
        });
      } catch (err) {
        settle(err instanceof Error ? err : new Error(String(err)));
      }
    };

    const onMetadataReady = () => {
      if (startTime > 0) {
        video.currentTime = startTime;
        video.addEventListener("seeked", startRecording, { once: true });
      } else {
        startRecording();
      }
    };

    if (video.readyState >= 1) {
      onMetadataReady();
    } else {
      video.addEventListener("loadedmetadata", onMetadataReady, { once: true });
    }
  });
}
