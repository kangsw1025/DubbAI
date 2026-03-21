import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { transcribeAudio, synthesizeSpeech } from "./elevenlabs.service";
import { translateText } from "./deepl.service";
import { extractAudioFromVideo } from "./ffmpeg.service";
export interface DubFileResult {
  transcript: string;
  translation: string;
  audioBuffer: Buffer;
}

export async function dubFile(
  fileBuffer: Buffer,
  filename: string,
  fileType: string,
  targetLanguage: string,
): Promise<DubFileResult> {
  const timestamp = Date.now();
  const inputPath = join(tmpdir(), `dubbai-input-${timestamp}-${filename}`);
  let audioPath: string | null = null;

  try {
    await writeFile(inputPath, fileBuffer);

    if (fileType.startsWith("video/")) {
      audioPath = await extractAudioFromVideo(inputPath);
    }

    const audioFilePath = audioPath ?? inputPath;
    const audioBuffer = await readFile(audioFilePath);

    const transcript = await transcribeAudio(audioBuffer);
    const translation = await translateText(transcript, targetLanguage);
    const dubbedAudio = await synthesizeSpeech(translation);

    return {
      transcript,
      translation,
      audioBuffer: dubbedAudio,
    };
  } finally {
    try {
      await unlink(inputPath);
    } catch {}
    if (audioPath) {
      try {
        await unlink(audioPath);
      } catch {}
    }
  }
}
