import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { join } from "path";
import { tmpdir } from "os";

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg binary not found"));
      return;
    }

    const proc = spawn(ffmpegPath, args);

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });

    proc.on("error", reject);
  });
}

/** 비디오에서 오디오만 추출 (서버사이드) */
export async function extractAudioFromVideo(videoPath: string): Promise<string> {
  const outputPath = join(tmpdir(), `dubbai-audio-${Date.now()}.mp3`);
  await runFfmpeg([
    "-i", videoPath,
    "-vn",
    "-acodec", "mp3",
    "-y",
    outputPath,
  ]);
  return outputPath;
}

/**
 * 비디오를 지정 구간으로 클립 + 오디오 추출 (iOS 서버올인 경로)
 * -c:v copy 로 재인코딩 없이 빠르게 처리
 */
export async function clipAndExtractAudio(
  videoPath: string,
  startTime: number,
  durationSec: number,
): Promise<{ clippedVideoPath: string; audioPath: string }> {
  const ts = Date.now();
  const ext = videoPath.split(".").pop() ?? "mp4";
  const clippedVideoPath = join(tmpdir(), `dubbai-clip-${ts}.${ext}`);
  const audioPath = join(tmpdir(), `dubbai-audio-${ts}.mp3`);

  // 구간 클립 (스트림 복사, 빠름 / rotation 메타데이터 유지)
  await runFfmpeg([
    "-ss", String(startTime),
    "-i", videoPath,
    "-t", String(durationSec),
    "-c:v", "copy",
    "-c:a", "copy",
    "-map_metadata", "0",
    "-y",
    clippedVideoPath,
  ]);

  // 클립에서 오디오 추출
  await runFfmpeg([
    "-i", clippedVideoPath,
    "-vn",
    "-acodec", "mp3",
    "-y",
    audioPath,
  ]);

  return { clippedVideoPath, audioPath };
}

/**
 * 비디오 + 더빙 오디오 합성 (서버사이드 mux)
 * Android: 이미 클립된 webm + dubbed mp3
 * iOS: clipAndExtractAudio 후 클립된 비디오 + dubbed mp3
 */
export async function muxVideoWithAudio(
  videoPath: string,
  audioPath: string,
): Promise<string> {
  const outputPath = join(tmpdir(), `dubbai-mux-${Date.now()}.mp4`);

  await runFfmpeg([
    "-i", videoPath,
    "-i", audioPath,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-map_metadata", "0",
    "-y",
    outputPath,
  ]);

  return outputPath;
}
