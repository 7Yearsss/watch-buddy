import { activeConfig } from "./config";
import { zh } from "./copy/zh";
import { en } from "./copy/en";

/**
 * Game text is stored as message keys + params (decision 6, option B): saves never hold finished sentences, so the
 * server can say the same feed, letters and chat in whichever language the request asks for, and copy can change
 * through remote config without an app release. Fixed UI words (buttons, titles) stay in each app's own catalog.
 */
export type Locale = "zh" | "en";
export const LOCALES: Locale[] = ["zh", "en"];
export const DEFAULT_LOCALE: Locale = "zh";

/** A param: plain text (a friend's name, never translated), a number (formatted per locale), a nested message, or a list. */
export type Arg = string | number | Msg | Arg[];
export interface Msg {
  k: string;
  p?: Record<string, Arg>;
}

export const msg = (k: string, p?: Record<string, Arg>): Msg => (p ? { k, p } : { k });
/** Text that isn't in the catalog: remote-config copy given per locale, or a line from a save written before keys. */
export const raw = (text: string | Partial<Record<Locale, string>>): Msg => ({ k: "$raw", p: typeof text === "string" ? { zh: text } : (text as Record<string, string>) });
/** Paragraphs, one per line (letters). */
export const lines = (...items: Arg[]): Msg => ({ k: "$lines", p: { items } });
/** Sentences run together: no space in Chinese, one space in English. */
export const cat = (...items: Arg[]): Msg => ({ k: "$cat", p: { items } });
/** The first clause of a message, cut to watch size (a dream's "我梦见自己在云上跑步…"). */
export const firstClause = (text: Msg): Msg => ({ k: "$first", p: { text } });
/** Hours + minutes, without "0 分". */
export const duration = (min: number): Msg => (min % 60 ? msg("fmt.hm", { h: Math.floor(min / 60), m: min % 60 }) : msg("fmt.h", { h: Math.floor(min / 60) }));

export const CATALOGS: Record<Locale, Record<string, string>> = { zh, en };

/** First supported language in an Accept-Language header (or a bare "en"/"zh-Hans"), else Chinese. */
export function pickLocale(header?: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const tags = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((x) => x.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { tag: (tag ?? "").toLowerCase(), q: Number.isFinite(q) ? q : 0, i };
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { tag } of tags) {
    const base = tag.split("-")[0] as Locale;
    if (LOCALES.includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}

const isMsg = (x: unknown): x is Msg => !!x && typeof x === "object" && !Array.isArray(x) && typeof (x as Msg).k === "string";

/** The template for a key: remote override first, then this locale, then Chinese, then the key itself (so a gap shows). */
export function template(k: string, locale: Locale): string {
  const copy = activeConfig().copy;
  return copy?.[locale]?.[k] ?? CATALOGS[locale][k] ?? copy?.zh?.[k] ?? zh[k] ?? k;
}

const numberFormat: Partial<Record<Locale, Intl.NumberFormat>> = {};
const fmtNumber = (n: number, locale: Locale) => (numberFormat[locale] ??= new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US")).format(n);

const FIRST_MAX: Record<Locale, number> = { zh: 12, en: 22 };

/** Render a message (or anything a message param can be) as text in one language. */
export function t(x: Arg | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  if (x === null || x === undefined) return "";
  if (typeof x === "string") return x;
  if (typeof x === "number") return fmtNumber(x, locale);
  if (Array.isArray(x)) return x.map((i) => t(i, locale)).join(template("$sep", locale));
  if (!isMsg(x)) return "";
  const p = x.p ?? {};
  switch (x.k) {
    case "$raw": {
      const by = p as Record<string, string>;
      return by[locale] ?? by.zh ?? Object.values(by)[0] ?? "";
    }
    case "$lines":
      return ((p.items as Arg[]) ?? []).map((i) => t(i, locale)).join("\n");
    case "$cat":
      return ((p.items as Arg[]) ?? []).map((i) => t(i, locale)).filter(Boolean).join(template("$space", locale));
    case "$first": {
      const full = t(p.text, locale);
      const first = full.split(/[，……！。,.!…]/)[0]!.trim();
      const max = FIRST_MAX[locale];
      return first.length > max ? first.slice(0, max - 1) + "…" : first + "…";
    }
  }
  return fill(template(x.k, locale), p, locale);
}

/**
 * `{name}` → param; `{n|one|other}` → plural by n, with `#` standing for the number. A space before a param that
 * comes out empty goes too ("I won! {why}" with no reason doesn't end in a space).
 */
function fill(tpl: string, p: Record<string, Arg>, locale: Locale): string {
  return tpl.replace(/( ?)\{(\w+)(?:\|([^|{}]*)\|([^{}]*))?\}/g, (_, space: string, name: string, one?: string, other?: string) => {
    const v = p[name];
    if (one !== undefined) {
      const n = typeof v === "number" ? v : Number(v);
      return space + (n === 1 ? one : other!).replace(/#/g, fmtNumber(n, locale));
    }
    const out = t(v, locale);
    return out ? space + out : "";
  });
}

/** Turn an old save's finished sentence into a message, so saves from before keys keep loading. */
export const asMsg = (x: Msg | string): Msg => (typeof x === "string" ? raw(x) : x);
export const asMsgOrNull = (x: Msg | string | null | undefined): Msg | null => (x === null || x === undefined ? null : asMsg(x));
