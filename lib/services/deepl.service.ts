import * as deepl from "deepl-node";

let _translator: deepl.Translator | null = null;

function getTranslator() {
  if (!_translator) {
    if (!process.env.DEEPL_API_KEY) {
      throw new Error("DEEPL_API_KEY is not set");
    }
    _translator = new deepl.Translator(process.env.DEEPL_API_KEY);
  }
  return _translator;
}

export async function translateText(
  text: string,
  targetLanguage: string
): Promise<string> {
  const result = await getTranslator().translateText(
    text,
    null,
    targetLanguage as deepl.TargetLanguageCode
  );
  return result.text;
}
