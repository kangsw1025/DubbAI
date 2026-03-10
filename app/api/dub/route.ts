import { NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import * as deepl from "deepl-node";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeFile, unlink, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

export const maxDuration = 60;

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY!,
});

const translator = new deepl.Translator(process.env.DEEPL_API_KEY!);

function extractAudioFromVideo(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg not found"));
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
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

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

  const file = formData.get("file") as File | null;
  const targetLanguage = formData.get("targetLanguage") as string | null;

  if (!file || !targetLanguage) {
    return NextResponse.json({ error: "file과 targetLanguage가 필요합니다." }, { status: 400 });
  }

  const timestamp = Date.now();
  const inputPath = join(tmpdir(), `dubbai-input-${timestamp}-${file.name}`);
  const audioPath = join(tmpdir(), `dubbai-audio-${timestamp}.mp3`);

  try {
    // 업로드 파일 저장
    const bytes = await file.arrayBuffer();
    await writeFile(inputPath, Buffer.from(bytes));

    // 비디오면 오디오 추출
    const isVideo = file.type.startsWith("video/");
    const audioFilePath = isVideo ? audioPath : inputPath;
    if (isVideo) {
      await extractAudioFromVideo(inputPath, audioPath);
    }

    // STT: 음성 → 텍스트
    const audioBuffer = await readFile(audioFilePath);
    const audioBlob = new Blob([audioBuffer], { type: "audio/mp3" });
    const transcription = await elevenlabs.speechToText.convert({
      file: audioBlob,
      model_id: "scribe_v1",
    });
    const originalText = transcription.text;

    // 번역: DeepL
    const translationResult = await translator.translateText(
      originalText,
      null,
      targetLanguage as deepl.TargetLanguageCode
    );
    const translatedText = translationResult.text;

    // TTS: 텍스트 → 음성 (Rachel 목소리, 다국어 모델)
    const ttsStream = await elevenlabs.textToSpeech.convert(
      "21m00Tcm4TlvDq8ikWAM",
      {
        text: translatedText,
        model_id: "eleven_multilingual_v2",
      }
    );

    // 스트림 → 버퍼
    const chunks: Buffer[] = [];
    for await (const chunk of ttsStream) {
      chunks.push(Buffer.from(chunk));
    }
    const audioData = Buffer.concat(chunks);

    return NextResponse.json({
      transcript: originalText,
      translation: translatedText,
      audio: audioData.toString("base64"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    try { await unlink(inputPath); } catch {}
    try { await unlink(audioPath); } catch {}
  }
}
