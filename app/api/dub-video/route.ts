import { NextRequest, NextResponse } from "next/server";
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

export const maxDuration = 300;

/**
 * 서버 올인원 비디오 더빙 엔드포인트
 *
 * 응답 형식: [4바이트 메타 길이][JSON 메타데이터][비디오 바이너리]
 * - 메타데이터: { transcript, translation, mimeType }
 * - 바이너리: 더빙된 비디오 파일
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const videoFile = formData.get("video") as File | null;
  const targetLanguage = formData.get("targetLanguage") as string | null;
  const startTimeStr = formData.get("startTime") as string | null;

  if (!videoFile || !targetLanguage) {
    return NextResponse.json(
      { error: "video와 targetLanguage가 필요합니다." },
      { status: 400 },
    );
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

    // 오디오 파일 검증 (오디오 트랙 없는 영상 대응)
    const audioStat = await stat(audioPath);
    if (audioStat.size === 0) {
      return NextResponse.json(
        { error: "영상에 오디오 트랙이 없습니다." },
        { status: 400 },
      );
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

    // 길이 프리픽스 바이너리 프로토콜: [4B 메타길이][JSON][비디오]
    const metadata = JSON.stringify({
      transcript,
      translation,
      mimeType,
    });
    const metaBuffer = Buffer.from(metadata, "utf-8");
    const lengthPrefix = Buffer.alloc(4);
    lengthPrefix.writeUInt32BE(metaBuffer.length);

    const responseBuffer = Buffer.concat([
      lengthPrefix,
      metaBuffer,
      outputBuffer,
    ]);

    return new NextResponse(new Uint8Array(responseBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(responseBuffer.byteLength),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await Promise.allSettled(tempPaths.map((p) => unlink(p).catch(() => {})));
  }
}
