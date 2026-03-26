import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

let _client: ElevenLabsClient | null = null;

function getClient() {
  if (!_client) {
    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY is not set");
    }
    _client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  }
  return _client;
}

const VOICE_ID = "OVFwoAQPGtDro3aRIwiK";
const TTS_MODEL = "eleven_multilingual_v2";
const STT_MODEL = "scribe_v1";

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/mp3" });
  const result = await getClient().speechToText.convert({
    file: blob,
    modelId: STT_MODEL,
  });
  return result.text;
}

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const stream = await getClient().textToSpeech.convert(VOICE_ID, {
    text,
    modelId: TTS_MODEL,
  });

  const chunks: Uint8Array[] = [];
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
