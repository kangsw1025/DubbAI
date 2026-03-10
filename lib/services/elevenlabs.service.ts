import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY!,
});

const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel (multilingual)
const TTS_MODEL = "eleven_multilingual_v2";
const STT_MODEL = "scribe_v1";

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const blob = new Blob([audioBuffer], { type: "audio/mp3" });
  const result = await client.speechToText.convert({
    file: blob,
    model_id: STT_MODEL,
  });
  return result.text;
}

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const stream = await client.textToSpeech.convert(VOICE_ID, {
    text,
    model_id: TTS_MODEL,
  });

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
