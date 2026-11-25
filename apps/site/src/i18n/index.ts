/**
 * Languages. English is the default and lives at /; every other language at /<code>/ (the first App Store
 * launch is outside mainland China). Add a language: copy en.ts to <code>.ts and write it (don't translate line
 * by line), add it to DICTS / LANGS / HREFLANG below and to `locales` in astro.config.mjs, and give it fonts in
 * site.css if its script needs them. src/pages/[lang]/index.astro builds the page by itself.
 */
import { zh } from "./zh";
import { en } from "./en";
import { zhHant } from "./zh-hant";
import { ja } from "./ja";
import { ko } from "./ko";
import { de } from "./de";
import { fr } from "./fr";
import { es } from "./es";

export type Dict = typeof zh;
export const LANGS = ["en", "zh", "zh-hant", "ja", "ko", "de", "fr", "es"] as const;
export type Lang = (typeof LANGS)[number];
export const DICTS: Record<Lang, Dict> = { en, zh, "zh-hant": zhHant, ja, ko, de, fr, es };
export const PATHS = Object.fromEntries(LANGS.map((l) => [l, l === "en" ? "/" : `/${l}/`])) as Record<Lang, string>;
/** BCP 47 tags for hreflang. */
export const HREFLANG: Record<Lang, string> = { en: "en", zh: "zh-Hans", "zh-hant": "zh-Hant", ja: "ja", ko: "ko", de: "de", fr: "fr", es: "es" };

export const langOf = (locale: string | undefined): Lang => (LANGS as readonly string[]).includes(locale ?? "") ? (locale as Lang) : "en";
