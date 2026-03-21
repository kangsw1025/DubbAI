import { dubFile } from "@/lib/services/dubbing.service";
import * as elevenlabsService from "@/lib/services/elevenlabs.service";
import * as deeplService from "@/lib/services/deepl.service";

// Mock underlying packages first to prevent constructor errors on module load
jest.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: jest.fn().mockImplementation(() => ({
    speechToText: { convert: jest.fn() },
    textToSpeech: { convert: jest.fn() },
  })),
}));
jest.mock("deepl-node", () => ({
  Translator: jest.fn().mockImplementation(() => ({
    translateText: jest.fn(),
  })),
}));

// Then mock the service layer
jest.mock("@/lib/services/elevenlabs.service");
jest.mock("@/lib/services/deepl.service");
jest.mock("@/lib/services/ffmpeg.service", () => ({
  extractAudioFromVideo: jest.fn().mockResolvedValue("/tmp/audio.mp3"),
}));
jest.mock("fs/promises", () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from("audio data")),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe("Dubbing Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("오디오 파일에 대해 전체 더빙 파이프라인을 실행해야 한다", async () => {
    (elevenlabsService.transcribeAudio as jest.Mock).mockResolvedValue("Hello world");
    (deeplService.translateText as jest.Mock).mockResolvedValue("안녕하세요");
    (elevenlabsService.synthesizeSpeech as jest.Mock).mockResolvedValue(Buffer.from("dubbed audio"));

    const result = await dubFile(Buffer.from("audio"), "test.mp3", "audio/mp3", "KO");

    expect(result.transcript).toBe("Hello world");
    expect(result.translation).toBe("안녕하세요");
    expect(typeof result.audio).toBe("string"); // base64
    expect(elevenlabsService.transcribeAudio).toHaveBeenCalledTimes(1);
    expect(deeplService.translateText).toHaveBeenCalledWith("Hello world", "KO");
    expect(elevenlabsService.synthesizeSpeech).toHaveBeenCalledWith("안녕하세요");
  });

  it("비디오 파일 시 오디오 추출을 먼저 실행해야 한다", async () => {
    const { extractAudioFromVideo } = require("@/lib/services/ffmpeg.service");
    (elevenlabsService.transcribeAudio as jest.Mock).mockResolvedValue("text");
    (deeplService.translateText as jest.Mock).mockResolvedValue("텍스트");
    (elevenlabsService.synthesizeSpeech as jest.Mock).mockResolvedValue(Buffer.from("audio"));

    await dubFile(Buffer.from("video"), "test.mp4", "video/mp4", "KO");

    expect(extractAudioFromVideo).toHaveBeenCalledTimes(1);
  });

  it("STT 오류 시 에러를 전파해야 한다", async () => {
    (elevenlabsService.transcribeAudio as jest.Mock).mockRejectedValue(new Error("STT failed"));

    await expect(
      dubFile(Buffer.from("audio"), "test.mp3", "audio/mp3", "KO")
    ).rejects.toThrow("STT failed");
  });
});
