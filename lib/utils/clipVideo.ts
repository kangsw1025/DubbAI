"use client";

export const CLIP_SECONDS = 60;

export interface ClipResult {
  videoBlob: Blob;
  audioBlob: Blob;
}

export function clipVideo(file: File, startTime = 0): Promise<ClipResult> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = objectUrl;
    video.volume = 0;
    video.playsInline = true;

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("비디오 로드 실패"));
    });

    const startRecording = () => {
      const getCaptureStream =
        "captureStream" in video
          ? () => (video as HTMLVideoElement & { captureStream(): MediaStream }).captureStream()
          : "mozCaptureStream" in video
            ? () =>
                (
                  video as HTMLVideoElement & { mozCaptureStream(): MediaStream }
                ).mozCaptureStream()
            : null;

      if (!getCaptureStream) {
        cleanup();
        reject(new Error("이 브라우저는 영상 클립을 지원하지 않습니다."));
        return;
      }

      const endTime =
        startTime +
        Math.min(
          CLIP_SECONDS,
          isFinite(video.duration) ? video.duration - startTime : CLIP_SECONDS,
        );

      const stream = getCaptureStream();

      const pickMime = (types: string[], fallback: string) =>
        types.find((t) => MediaRecorder.isTypeSupported(t)) ?? fallback;

      const videoMime = pickMime(["video/webm;codecs=vp8,opus", "video/webm"], "video/webm");
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
        if (video.currentTime >= endTime) stopAll();
      });
      video.addEventListener("ended", stopAll);
      setTimeout(stopAll, (endTime - startTime + 5) * 1000);

      videoRecorder.start(200);
      if (audioRecorder) audioRecorder.start(200);
      video.play().catch(() => {
        cleanup();
        reject(new Error("비디오 재생 실패"));
      });
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

export function extractAudioFromVideo(
  file: File,
  startTime = 0,
  durationSec?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = objectUrl;
    video.volume = 0;
    video.playsInline = true;

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    let settled = false;
    const settle = (result: Blob | Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      video.pause();
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
      const getCaptureStream =
        "captureStream" in video
          ? () => (video as HTMLVideoElement & { captureStream(): MediaStream }).captureStream()
          : "mozCaptureStream" in video
            ? () =>
                (
                  video as HTMLVideoElement & { mozCaptureStream(): MediaStream }
                ).mozCaptureStream()
            : null;

      if (!getCaptureStream) {
        settle(new Error("이 브라우저는 영상 클립을 지원하지 않습니다."));
        return;
      }

      const clipDuration = durationSec ?? CLIP_SECONDS;
      const endTime =
        startTime +
        Math.min(
          clipDuration,
          isFinite(video.duration) ? video.duration - startTime : clipDuration,
        );

      const stream = getCaptureStream();

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        settle(new Error("오디오 트랙을 찾을 수 없습니다."));
        return;
      }

      const pickMime = (types: string[], fallback: string) =>
        types.find((t) => MediaRecorder.isTypeSupported(t)) ?? fallback;

      const audioMime = pickMime(
        ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"],
        "audio/webm",
      );

      const audioChunks: BlobPart[] = [];
      const audioRecorder = new MediaRecorder(new MediaStream(audioTracks), {
        mimeType: audioMime,
      });

      audioRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      audioRecorder.onerror = () => {
        if (audioRecorder.state !== "inactive") audioRecorder.stop();
        settle(new Error("오디오 녹화 실패"));
      };

      audioRecorder.onstop = () => {
        settle(new Blob(audioChunks, { type: audioMime.split(";")[0] }));
      };

      let stopped = false;
      const stopAll = () => {
        if (stopped) return;
        stopped = true;
        video.pause();
        if (audioRecorder.state !== "inactive") audioRecorder.stop();
      };

      video.addEventListener("timeupdate", () => {
        if (video.currentTime >= endTime) stopAll();
      });
      video.addEventListener("ended", stopAll);
      setTimeout(stopAll, (endTime - startTime + 5) * 1000);

      audioRecorder.start(200);
      video.play().catch(() => {
        settle(new Error("비디오 재생 실패"));
      });
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
