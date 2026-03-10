import * as deepl from "deepl-node";

const translator = new deepl.Translator(process.env.DEEPL_API_KEY!);

export async function translateText(
  text: string,
  targetLanguage: string
): Promise<string> {
  const result = await translator.translateText(
    text,
    null,
    targetLanguage as deepl.TargetLanguageCode
  );
  return result.text;
}
