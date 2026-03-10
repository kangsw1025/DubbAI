import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { join } from "path";
import { tmpdir } from "os";

export async function extractAudioFromVideo(videoPath: string): Promise<string> {
  const outputPath = join(tmpdir(), `dubbai-audio-${Date.now()}.mp3`);

  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg binary not found"));
      return;
    }

    const ffmpeg = spawn(ffmpegPath, [
      "-i", videoPath,
      "-vn",
      "-acodec", "mp3",
      "-y",
      outputPath,
    ]);

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });

    ffmpeg.on("error", (err) => reject(err));
  });
}
