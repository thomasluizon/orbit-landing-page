import type { TranslationKey } from "../i18n/translations";

export function planFromWords(words: string) {
  const title =
    words
      .trim()
      .replace(/^(?:I want to |I'd like to |Plan (?:a |an )?|Quero |Gostaria de )/i, "")
      .replace(/[.!?]+$/, "")
      .slice(0, 80)
      .trim() || words.trim().slice(0, 80);
  const schedule: TranslationKey = /night|evening|noite/i.test(words)
    ? "demo.start.alternateRepeat"
    : /afternoon|tarde/i.test(words)
      ? "demo.afternoon"
      : "demo.start.repeat";
  return { title, schedule };
}
