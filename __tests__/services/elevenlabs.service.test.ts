import {
  transcribeAudio,
  synthesizeSpeech,
} from "@/lib/services/elevenlabs.service";

// Required for lazy client initialization in service
process.env.ELEVENLABS_API_KEY = "test-api-key";

jest.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: jest.fn().mockImplementation(() => ({
    speechToText: { convert: jest.fn() },
    textToSpeech: { convert: jest.fn() },
  })),
}));

describe("ElevenLabs Service", () => {
  let mockSTT: jest.Mock;
  let mockTTS: jest.Mock;

  beforeAll(async () => {
    const { ElevenLabsClient } = jest.requireMock("@elevenlabs/elevenlabs-js");
    // Warm up: trigger lazy client init so mock.results[0] is populated
    ElevenLabsClient.mockImplementationOnce(() => ({
      speechToText: { convert: jest.fn().mockResolvedValue({ text: "" }) },
      textToSpeech: { convert: jest.fn() },
    }));
    await transcribeAudio(Buffer.from("warmup"));
    // Capture references to the mock fns on the created instance
    mockSTT = ElevenLabsClient.mock.results[0].value.speechToText.convert;
    mockTTS = ElevenLabsClient.mock.results[0].value.textToSpeech.convert;
  });

  beforeEach(() => {
    mockSTT.mockReset();
    mockTTS.mockReset();
  });

  describe("transcribeAudio", () => {
    it("오디오 버퍼를 텍스트로 변환해야 한다", async () => {
      mockSTT.mockResolvedValue({ text: "Hello world" });

      const buffer = Buffer.from("fake audio data");
      const result = await transcribeAudio(buffer);

      expect(result).toBe("Hello world");
      expect(mockSTT).toHaveBeenCalledTimes(1);
    });

    it("STT API 오류 시 에러를 전파해야 한다", async () => {
      mockSTT.mockRejectedValue(new Error("API error"));

      await expect(transcribeAudio(Buffer.from("audio"))).rejects.toThrow("API error");
    });
  });

  describe("synthesizeSpeech", () => {
    it("텍스트를 오디오 버퍼로 변환해야 한다", async () => {
      const chunks = [Buffer.from("audio"), Buffer.from(" chunk")];
      let index = 0;
      const mockStream = {
        getReader: () => ({
          read: jest.fn().mockImplementation(() => {
            if (index < chunks.length) {
              return Promise.resolve({ done: false, value: chunks[index++] });
            }
            return Promise.resolve({ done: true, value: undefined });
          }),
        }),
      };
      mockTTS.mockResolvedValue(mockStream);

      const result = await synthesizeSpeech("Hello world");

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      expect(mockTTS).toHaveBeenCalledWith(
        "21m00Tcm4TlvDq8ikWAM",
        expect.objectContaining({ text: "Hello world" }),
      );
    });

    it("TTS API 오류 시 에러를 전파해야 한다", async () => {
      mockTTS.mockRejectedValue(new Error("TTS error"));

      await expect(synthesizeSpeech("text")).rejects.toThrow("TTS error");
    });
  });
});
