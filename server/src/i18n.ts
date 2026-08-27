import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Twenty languages plus English, chosen by the same reasoning as the Android
 * app's: Android install base, with the four dialect pairs that differ in the
 * words this app uses most kept apart rather than folded together.
 *
 * The phones ship the same set. Somebody who reads the site in Polish and then
 * installs the app should not find it in English, and the copy is deliberately
 * word for word across the three clients, so the translations are shared.
 */
export const LOCALES = [
  'en',
  'es', 'es-US', 'pt-BR', 'pt-PT', 'fr', 'de', 'it', 'nl', 'ru', 'uk',
  'pl', 'tr', 'ar', 'hi', 'id', 'ja', 'ko', 'zh-CN', 'zh-TW', 'vi',
] as const;

export type Locale = (typeof LOCALES)[number];

/** Written right to left. Only Arabic in this set, but the check is by data. */
const RTL = new Set<string>(['ar']);

export const direction = (locale: string): 'ltr' | 'rtl' =>
  RTL.has(locale.split('-')[0] as string) ? 'rtl' : 'ltr';

/**
 * What each language calls itself. A language picker written in the language
 * the visitor cannot read is no use to the person who needs it.
 */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  'en': 'English',
  'es': 'Español',
  'es-US': 'Español (Latinoamérica)',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  'fr': 'Français',
  'de': 'Deutsch',
  'it': 'Italiano',
  'nl': 'Nederlands',
  'ru': 'Русский',
  'uk': 'Українська',
  'pl': 'Polski',
  'tr': 'Türkçe',
  'ar': 'العربية',
  'hi': 'हिन्दी',
  'id': 'Bahasa Indonesia',
  'ja': '日本語',
  'ko': '한국어',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'vi': 'Tiếng Việt',
};

type Catalog = Record<string, string>;

const here = path.dirname(fileURLToPath(import.meta.url));

/*
 * Read once at startup rather than imported: JSON import attributes are still
 * awkward across the TypeScript and Node versions this builds under, and a
 * catalog that fails to load should fail loudly here rather than half-render a
 * page later.
 */
const catalogs: Record<string, Catalog> = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(here, 'locales', `${locale}.json`), 'utf8')) as Catalog,
  ]),
);

/** English is the source of truth; everything else falls back to it per key. */
const english = catalogs.en as Catalog;

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Looks a key up, then fills `{name}` placeholders.
 *
 * A missing key falls back to English rather than rendering the key itself: a
 * page in mostly-Polish with one English sentence is worse than the alternative
 * only in theory, and blank or `week.remaining` on screen is worse than both.
 */
export function translator(locale: string): Translate {
  const catalog = catalogs[locale] ?? english;
  return (key, params) => {
    const template = catalog[key] ?? english[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole);
  };
}

/** Every key whose name starts with `prefix`, for handing to page scripts. */
export function subset(locale: string, prefix: string): Catalog {
  const catalog = catalogs[locale] ?? english;
  const out: Catalog = {};
  for (const key of Object.keys(english)) {
    if (key.startsWith(prefix)) out[key] = catalog[key] ?? english[key] ?? key;
  }
  return out;
}

const supported = new Set<string>(LOCALES);

/**
 * Picks the locale for a request.
 *
 * An explicit choice wins and is remembered; otherwise the browser's own
 * Accept-Language list decides. Region is honoured when we have that exact
 * pair — pt-BR and pt-PT are different translations here — and otherwise falls
 * back to the base language, so pt-AO gets Portuguese rather than English.
 */
export function pickLocale(header: string | undefined, cookie: string | undefined,
                           query: string | undefined): Locale {
  const explicit = normalise(query) ?? normalise(cookie);
  if (explicit) return explicit;

  for (const tag of parseAcceptLanguage(header)) {
    const match = normalise(tag);
    if (match) return match;
  }
  return 'en';
}

/** Case-insensitive, and tolerant of the underscore form some clients send. */
function normalise(tag: string | undefined): Locale | undefined {
  if (!tag) return undefined;
  const cleaned = tag.trim().replace('_', '-');
  if (!cleaned) return undefined;

  const exact = LOCALES.find((l) => l.toLowerCase() === cleaned.toLowerCase());
  if (exact) return exact;

  const base = cleaned.split('-')[0]?.toLowerCase();
  if (!base) return undefined;
  // zh and pt have no bare entry: default zh to Simplified and pt to Brazil,
  // which is where most of each language's speakers are.
  if (base === 'zh') return cleaned.toLowerCase().includes('tw')
    || cleaned.toLowerCase().includes('hant') ? 'zh-TW' : 'zh-CN';
  if (base === 'pt') return 'pt-BR';
  return supported.has(base) ? (base as Locale) : undefined;
}

/** `en-GB,en;q=0.9,fr;q=0.8` in preference order. */
function parseAcceptLanguage(header: string | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const [tag, ...rest] = part.trim().split(';');
      const q = rest.find((p) => p.trim().startsWith('q='));
      return { tag: (tag ?? '').trim(), q: q ? Number(q.split('=')[1]) : 1 };
    })
    .filter((entry) => entry.tag.length > 0 && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
}

/** The `lang` cookie, if the visitor has chosen one. */
export function localeCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === 'lang') return decodeURIComponent(value.join('='));
  }
  return undefined;
}
