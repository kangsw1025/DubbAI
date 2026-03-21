import { spawn } from "child_process";
import { join } from "path";
import { tmpdir } from "os";

// Turbopack이 빌드 시점에 경로를 /ROOT/로 재매핑하는 문제 방지
// 정적 분석을 우회하여 런타임에 실제 경로를 resolve
function getFfmpegPath(): string {
  const modulePath = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  return modulePath;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const binPath = getFfmpegPath();

    const proc = spawn(binPath, args);
    const stderrChunks: Buffer[] = [];
    proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    proc.stdout.resume();

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else {
        const stderr = Buffer.concat(stderrChunks).toString().slice(-500);
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", reject);
  });
}

/** 비디오에서 오디오만 추출 (서버사이드) */
export async function extractAudioFromVideo(
  videoPath: string,
): Promise<string> {
  const outputPath = join(tmpdir(), `dubbai-audio-${Date.now()}.mp3`);
  await runFfmpeg(["-i", videoPath, "-vn", "-acodec", "mp3", "-y", outputPath]);
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
    "-ss",
    String(startTime),
    "-i",
    videoPath,
    "-t",
    String(durationSec),
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    "-map_metadata",
    "0",
    "-y",
    clippedVideoPath,
  ]);

  // 클립에서 오디오 추출
  await runFfmpeg([
    "-i",
    clippedVideoPath,
    "-vn",
    "-acodec",
    "mp3",
    "-y",
    audioPath,
  ]);

  return { clippedVideoPath, audioPath };
}

/**
 * 비디오 + 더빙 오디오 합성 (서버사이드 mux)
 *
 * Android: webm(VP8) 클립 + mp3 → webm 출력 (VP8 복사, 오디오 libopus 변환)
 * iOS:     mp4/mov 클립 + mp3 → mp4 출력 (영상 스트림 복사)
 *
 * webm → mp4 direct copy는 VP8 호환 불가이므로 컨테이너를 입력에 맞춰 출력
 */
export async function muxVideoWithAudio(
  videoPath: string,
  audioPath: string,
): Promise<{ outputPath: string; mimeType: string }> {
  const ext = videoPath.split(".").pop()?.toLowerCase() ?? "mp4";
  const isWebm = ext === "webm";
  const ts = Date.now();

  if (isWebm) {
    // Android: VP8(webm) + mp3 → webm (오디오만 libopus 변환)
    const outputPath = join(tmpdir(), `dubbai-mux-${ts}.webm`);
    await runFfmpeg([
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "libopus",
      "-y",
      outputPath,
    ]);
    return { outputPath, mimeType: "video/webm" };
  } else {
    // iOS: mp4/mov + mp3 → mp4 (영상 스트림 복사)
    const outputPath = join(tmpdir(), `dubbai-mux-${ts}.mp4`);
    await runFfmpeg([
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-map_metadata",
      "0",
      "-y",
      outputPath,
    ]);
    return { outputPath, mimeType: "video/mp4" };
  }
}
