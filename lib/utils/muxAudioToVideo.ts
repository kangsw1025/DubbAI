"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const FFMPEG_CORE_VERSION = "0.12.6";
const FFMPEG_BASE_URL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

export async function muxAudioToVideo(
  videoFile: File,
  dubbedAudioBlob: Blob,
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
  const outputName = `output.${ext}`;

  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
  await ffmpeg.writeFile("dubbed.mp3", await fetchFile(dubbedAudioBlob));

  await ffmpeg.exec([
    "-i",
    inputName,
    "-i",
    "dubbed.mp3",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-y",
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  return new File([data as BlobPart], `dubbed.${ext}`, {
    type: videoFile.type,
  });
}
