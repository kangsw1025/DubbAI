import { translateText } from "@/lib/services/deepl.service";

// Required for lazy client initialization in service
process.env.DEEPL_API_KEY = "test-api-key";

jest.mock("deepl-node", () => ({
  Translator: jest.fn().mockImplementation(() => ({
    translateText: jest.fn(),
  })),
}));

describe("DeepL Service", () => {
  let mockTranslateText: jest.Mock;

  beforeAll(async () => {
    const { Translator } = jest.requireMock("deepl-node");
    // Warm up: trigger lazy translator init so mock.results[0] is populated
    Translator.mockImplementationOnce(() => ({
      translateText: jest.fn().mockResolvedValue({ text: "" }),
    }));
    await translateText("warmup", "KO");
    // Capture reference to the mock fn on the created instance
    mockTranslateText = Translator.mock.results[0].value.translateText;
  });

  beforeEach(() => {
    mockTranslateText.mockReset();
  });

  it("텍스트를 타겟 언어로 번역해야 한다", async () => {
    mockTranslateText.mockResolvedValue({ text: "안녕하세요" });

    const result = await translateText("Hello", "KO");

    expect(result).toBe("안녕하세요");
    expect(mockTranslateText).toHaveBeenCalledWith("Hello", null, "KO");
  });

  it("영어로 번역해야 한다", async () => {
    mockTranslateText.mockResolvedValue({ text: "Hello world" });

    const result = await translateText("안녕하세요", "EN-US");

    expect(result).toBe("Hello world");
  });

  it("API 오류 시 에러를 전파해야 한다", async () => {
    mockTranslateText.mockRejectedValue(new Error("DeepL error"));

    await expect(translateText("text", "KO")).rejects.toThrow("DeepL error");
  });
});
