import { el } from "../dom";
import { t, type Language, type TranslationKey } from "../../shared/i18n";

const POINT_KEYS: TranslationKey[] = [
  "privacy.point1",
  "privacy.point2",
  "privacy.point3",
  "privacy.point4",
  "privacy.point5",
  "privacy.point6",
];

export function buildPrivacySection(lang: Language): HTMLElement {
  return el("div", { className: "card" }, [
    el("h3", { text: t(lang, "privacy.title") }),
    ...POINT_KEYS.map((key) => el("p", { className: "hint", text: `• ${t(lang, key)}` })),
  ]);
}
