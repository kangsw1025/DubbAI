"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeFile, readFile, unlink, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import {
  clipAndExtractAudio,
  extractAudioFromVideo,
  muxVideoWithAudio,
} from "@/lib/services/ffmpeg.service";
import {
  transcribeAudio,
  synthesizeSpeech,
} from "@/lib/services/elevenlabs.service";
import { translateText } from "@/lib/services/deepl.service";

export interface DubVideoResult {
  transcript: string;
  translation: string;
  videoBase64: string;
  mimeType: string;
}

/**
 * 서버 올인원 비디오 더빙 Server Action
 *
 * Server Action은 next.config.ts의 bodySizeLimit (200mb) 설정이 적용되어
 * Route Handler의 10MB 제한을 우회합니다.
 */
export async function dubVideoAction(
  formData: FormData,
): Promise<DubVideoResult> {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new Error("Unauthorized");
  }

  const videoFile = formData.get("video") as File | null;
  const targetLanguage = formData.get("targetLanguage") as string | null;
  const startTimeStr = formData.get("startTime") as string | null;

  if (!videoFile || !targetLanguage) {
    throw new Error("video와 targetLanguage가 필요합니다.");
  }

  const id = randomUUID();
  const videoExt = videoFile.name.split(".").pop() ?? "mp4";
  const videoPath = join(tmpdir(), `dubbai-${id}-input.${videoExt}`);
  const tempPaths: string[] = [videoPath];

  try {
    await writeFile(videoPath, Buffer.from(await videoFile.arrayBuffer()));

    let videoToMux: string;
    let audioPath: string;

    if (startTimeStr !== null) {
      const startTime = parseFloat(startTimeStr) || 0;
      const { clippedVideoPath, audioPath: clippedAudioPath } =
        await clipAndExtractAudio(videoPath, startTime, 60);
      tempPaths.push(clippedVideoPath, clippedAudioPath);
      videoToMux = clippedVideoPath;
      audioPath = clippedAudioPath;
    } else {
      const extractedAudioPath = await extractAudioFromVideo(videoPath);
      tempPaths.push(extractedAudioPath);
      videoToMux = videoPath;
      audioPath = extractedAudioPath;
    }

    const audioStat = await stat(audioPath);
    if (audioStat.size === 0) {
      throw new Error("영상에 오디오 트랙이 없습니다.");
    }

    const audioBuffer = await readFile(audioPath);
    const transcript = await transcribeAudio(audioBuffer);
    const translation = await translateText(transcript, targetLanguage);
    const dubbedAudioBuffer = await synthesizeSpeech(translation);

    const dubbedAudioPath = join(tmpdir(), `dubbai-${id}-tts.mp3`);
    tempPaths.push(dubbedAudioPath);
    await writeFile(dubbedAudioPath, dubbedAudioBuffer);

    const { outputPath, mimeType } = await muxVideoWithAudio(
      videoToMux,
      dubbedAudioPath,
    );
    tempPaths.push(outputPath);

    const outputBuffer = await readFile(outputPath);

    return {
      transcript,
      translation,
      videoBase64: outputBuffer.toString("base64"),
      mimeType,
    };
  } finally {
    await Promise.allSettled(tempPaths.map((p) => unlink(p).catch(() => {})));
  }
}
