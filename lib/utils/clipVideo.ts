"use client";

const CLIP_SECONDS = 60;

export interface ClipResult {
  videoBlob: Blob;
  audioBlob: Blob;
}

export function clipVideo(file: File): Promise<ClipResult> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = objectUrl;
    video.muted = true; // 스피커 음소거 (captureStream 오디오엔 영향 없음)
    video.playsInline = true;

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("비디오 로드 실패"));
    });

    video.addEventListener("loadedmetadata", () => {
      const captureStream =
        "captureStream" in video
          ? () => (video as HTMLVideoElement & { captureStream(): MediaStream }).captureStream()
          : "mozCaptureStream" in video
            ? () =>
                (
                  video as HTMLVideoElement & {
                    mozCaptureStream(): MediaStream;
                  }
                ).mozCaptureStream()
            : null;

      if (!captureStream) {
        cleanup();
        reject(new Error("이 브라우저는 영상 클립을 지원하지 않습니다."));
        return;
      }

      const clipDuration = Math.min(
        isFinite(video.duration) ? video.duration : CLIP_SECONDS,
        CLIP_SECONDS,
      );

      const stream = captureStream();

      const pickMime = (types: string[], fallback: string) =>
        types.find((t) => MediaRecorder.isTypeSupported(t)) ?? fallback;

      const videoMime = pickMime(
        ["video/webm;codecs=vp8,opus", "video/webm"],
        "video/webm",
      );
      const audioMime = pickMime(
        ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"],
        "audio/webm",
      );

      const videoChunks: BlobPart[] = [];
      const audioChunks: BlobPart[] = [];

      const videoRecorder = new MediaRecorder(stream, { mimeType: videoMime });

      const audioTracks = stream.getAudioTracks();
      const audioRecorder =
        audioTracks.length > 0
          ? new MediaRecorder(new MediaStream(audioTracks), { mimeType: audioMime })
          : null;

      videoRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunks.push(e.data);
      };
      if (audioRecorder) {
        audioRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };
      }

      let videoStopped = false;
      let audioStopped = audioRecorder === null;
      let resolved = false;

      const tryResolve = () => {
        if (!videoStopped || !audioStopped || resolved) return;
        resolved = true;
        cleanup();
        const videoBlob = new Blob(videoChunks, { type: videoMime.split(";")[0] });
        const audioBlob =
          audioChunks.length > 0
            ? new Blob(audioChunks, { type: audioMime.split(";")[0] })
            : videoBlob;
        resolve({ videoBlob, audioBlob });
      };

      videoRecorder.onstop = () => {
        videoStopped = true;
        tryResolve();
      };
      if (audioRecorder) {
        audioRecorder.onstop = () => {
          audioStopped = true;
          tryResolve();
        };
      }

      videoRecorder.onerror = () => {
        cleanup();
        reject(new Error("클립 녹화 실패"));
      };

      let stopped = false;
      const stopAll = () => {
        if (stopped) return;
        stopped = true;
        video.pause();
        if (videoRecorder.state !== "inactive") videoRecorder.stop();
        if (audioRecorder && audioRecorder.state !== "inactive") audioRecorder.stop();
      };

      video.addEventListener("timeupdate", () => {
        if (video.currentTime >= clipDuration) stopAll();
      });
      video.addEventListener("ended", stopAll);
      setTimeout(stopAll, (clipDuration + 5) * 1000);

      videoRecorder.start(200);
      if (audioRecorder) audioRecorder.start(200);
      video.play().catch(() => {
        cleanup();
        reject(new Error("비디오 재생 실패"));
      });
    });
  });
}
