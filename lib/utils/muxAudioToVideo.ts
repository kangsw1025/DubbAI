"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const FFMPEG_CORE_VERSION = "0.12.6";
const FFMPEG_BASE_URL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

export async function muxAudioToVideo(
  videoFile: File,
  dubbedAudioBlob: Blob,
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
  const normalizedExt = ext.toLowerCase();
  const isWebm = normalizedExt === "webm";
  const inputName = `input.${ext}`;
  const outputExt = isWebm ? "webm" : "mp4";
  const outputName = `output.${outputExt}`;
  const duration =
    endTime !== undefined && endTime > startTime ? endTime - startTime : null;

  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
  await ffmpeg.writeFile("dubbed.mp3", await fetchFile(dubbedAudioBlob));

  const args = ["-ss", String(startTime), "-i", inputName];
  if (duration !== null) {
    args.push("-t", String(duration));
  }
  args.push(
    "-i",
    "dubbed.mp3",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-shortest",
  );
  if (isWebm) {
    args.push("-c:a", "libopus");
  } else {
    args.push("-c:a", "aac");
  }
  args.push("-y", outputName);
  await ffmpeg.exec(args);

  const data = await ffmpeg.readFile(outputName);
  return new File([data as BlobPart], `dubbed.${outputExt}`, {
    type: isWebm ? "video/webm" : "video/mp4",
  });
}
