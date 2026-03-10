import { translateText } from "@/lib/services/deepl.service";

jest.mock("deepl-node", () => ({
  Translator: jest.fn().mockImplementation(() => ({
    translateText: jest.fn(),
  })),
}));

describe("DeepL Service", () => {
  const getMock = () => {
    const { Translator } = jest.requireMock("deepl-node");
    return Translator.mock.results[0].value.translateText as jest.Mock;
  };

  beforeEach(() => {
    getMock().mockReset();
  });

  it("텍스트를 타겟 언어로 번역해야 한다", async () => {
    getMock().mockResolvedValue({ text: "안녕하세요" });

    const result = await translateText("Hello", "KO");

    expect(result).toBe("안녕하세요");
    expect(getMock()).toHaveBeenCalledWith("Hello", null, "KO");
  });

  it("영어로 번역해야 한다", async () => {
    getMock().mockResolvedValue({ text: "Hello world" });

    const result = await translateText("안녕하세요", "EN-US");

    expect(result).toBe("Hello world");
  });

  it("API 오류 시 에러를 전파해야 한다", async () => {
    getMock().mockRejectedValue(new Error("DeepL error"));

    await expect(translateText("text", "KO")).rejects.toThrow("DeepL error");
  });
});
