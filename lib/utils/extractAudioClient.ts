"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const FFMPEG_CORE_VERSION = "0.12.6";
const FFMPEG_BASE_URL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

export async function extractAudioFromVideo(
  videoFile: File,
  startTime = 0,
  endTime?: number,
): Promise<File> {
  const ffmpeg = new FFmpeg();

  await ffmpeg.load({
    coreURL: await toBlobURL(
      `${FFMPEG_BASE_URL}/ffmpeg-core.js`,
      "text/javascript",
    ),
    wasmURL: await toBlobURL(
      `${FFMPEG_BASE_URL}/ffmpeg-core.wasm`,
      "application/wasm",
    ),
  });

  const ext = videoFile.name.split(".").pop() ?? "mp4";
  const inputName = `input.${ext}`;
  const duration =
    endTime !== undefined && endTime > startTime ? endTime - startTime : null;

  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
  const args = ["-ss", String(startTime), "-i", inputName];
  if (duration !== null) {
    args.push("-t", String(duration));
  }
  args.push("-vn", "-acodec", "mp3", "-y", "output.mp3");
  await ffmpeg.exec(args);

  const data = await ffmpeg.readFile("output.mp3");
  return new File([data as BlobPart], "audio.mp3", { type: "audio/mpeg" });
}
