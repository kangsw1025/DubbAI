import {
  transcribeAudio,
  synthesizeSpeech,
} from "@/lib/services/elevenlabs.service";

jest.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: jest.fn().mockImplementation(() => ({
    speechToText: { convert: jest.fn() },
    textToSpeech: { convert: jest.fn() },
  })),
}));

describe("ElevenLabs Service", () => {
  const getMockSTT = () => {
    const { ElevenLabsClient } = jest.requireMock("@elevenlabs/elevenlabs-js");
    return ElevenLabsClient.mock.results[0].value.speechToText
      .convert as jest.Mock;
  };

  const getMockTTS = () => {
    const { ElevenLabsClient } = jest.requireMock("@elevenlabs/elevenlabs-js");
    return ElevenLabsClient.mock.results[0].value.textToSpeech
      .convert as jest.Mock;
  };

  beforeEach(() => {
    getMockSTT().mockReset();
    getMockTTS().mockReset();
  });

  describe("transcribeAudio", () => {
    it("오디오 버퍼를 텍스트로 변환해야 한다", async () => {
      getMockSTT().mockResolvedValue({ text: "Hello world" });

      const buffer = Buffer.from("fake audio data");
      const result = await transcribeAudio(buffer);

      expect(result).toBe("Hello world");
      expect(getMockSTT()).toHaveBeenCalledTimes(1);
    });

    it("STT API 오류 시 에러를 전파해야 한다", async () => {
      getMockSTT().mockRejectedValue(new Error("API error"));

      await expect(transcribeAudio(Buffer.from("audio"))).rejects.toThrow(
        "API error",
      );
    });
  });

  describe("synthesizeSpeech", () => {
    it("텍스트를 오디오 버퍼로 변환해야 한다", async () => {
      async function* mockStream() {
        yield Buffer.from("audio");
        yield Buffer.from(" chunk");
      }
      getMockTTS().mockResolvedValue(mockStream());

      const result = await synthesizeSpeech("Hello world");

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      expect(getMockTTS()).toHaveBeenCalledWith(
        "21m00Tcm4TlvDq8ikWAM",
        expect.objectContaining({ text: "Hello world" }),
      );
    });

    it("TTS API 오류 시 에러를 전파해야 한다", async () => {
      getMockTTS().mockRejectedValue(new Error("TTS error"));

      await expect(synthesizeSpeech("text")).rejects.toThrow("TTS error");
    });
  });
});
