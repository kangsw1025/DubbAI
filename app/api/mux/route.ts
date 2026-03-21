import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  muxVideoWithAudio,
  clipAndExtractAudio,
} from "@/lib/services/ffmpeg.service";

export const maxDuration = 300;

/**
 * 서버사이드 mux 엔드포인트
 *
 * Android: video(webm 클립) + audio(mp3) → mux → MP4
 * iOS:     video(원본) + audio(mp3) + startTime → 서버 클립 + mux → MP4
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
  const audioFile = formData.get("audio") as File | null;
  const startTimeStr = formData.get("startTime") as string | null;

  if (!videoFile || !audioFile) {
    return NextResponse.json(
      { error: "video와 audio가 필요합니다." },
      { status: 400 },
    );
  }

  const ts = Date.now();
  const videoExt = videoFile.name.split(".").pop() ?? "mp4";
  const videoPath = join(tmpdir(), `dubbai-mux-input-${ts}.${videoExt}`);
  const audioPath = join(tmpdir(), `dubbai-mux-audio-${ts}.mp3`);
  const tempPaths: string[] = [videoPath, audioPath];

  try {
    await Promise.all([
      writeFile(videoPath, Buffer.from(await videoFile.arrayBuffer())),
      writeFile(audioPath, Buffer.from(await audioFile.arrayBuffer())),
    ]);

    let videoToMux = videoPath;

    // iOS 경로: startTime이 있으면 서버에서 클립
    if (startTimeStr !== null) {
      const startTime = parseFloat(startTimeStr) || 0;
      const { clippedVideoPath } = await clipAndExtractAudio(
        videoPath,
        startTime,
        60,
      );
      tempPaths.push(clippedVideoPath);
      videoToMux = clippedVideoPath;
    }

    const outputPath = await muxVideoWithAudio(videoToMux, audioPath);
    tempPaths.push(outputPath);

    const outputBuffer = await readFile(outputPath);

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="dubbed.mp4"',
        "Content-Length": String(outputBuffer.byteLength),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await Promise.allSettled(
      tempPaths.map((p) => unlink(p).catch(() => {})),
    );
  }
}
