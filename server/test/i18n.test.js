import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * The Android app gets this from lint, which fails the build when a string is
 * added to the default locale and not the other twenty. There is no lint here,
 * so it is a test: the failure mode of a translated app is a page that is half
 * translated, and it happens the moment somebody adds a string in a hurry.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', 'src', 'locales');

const read = (locale) =>
  JSON.parse(fs.readFileSync(path.join(dir, `${locale}.json`), 'utf8'));

const locales = fs.readdirSync(dir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace('.json', ''))
  .filter((locale) => locale !== 'en');

const english = read('en');
const placeholders = (text) => (text.match(/\{(\w+)\}/g) ?? []).sort();
const tags = (text) => (text.match(/<\/?\w+/g) ?? []).sort();

test('the language list and the catalogs on disk agree', async () => {
  const source = fs.readFileSync(path.join(here, '..', 'src', 'i18n.ts'), 'utf8');
  const declared = source
    .slice(source.indexOf('export const LOCALES'), source.indexOf('] as const'))
    .match(/'([\w-]+)'/g)
    .map((quoted) => quoted.replaceAll("'", ''));

  assert.deepEqual([...declared].sort(), ['en', ...locales].sort());
});

for (const locale of locales) {
  const catalog = read(locale);

  test(`${locale} translates every key`, () => {
    const missing = Object.keys(english).filter((key) => !(key in catalog));
    assert.deepEqual(missing, [], `${locale} is missing ${missing.length} key(s)`);
  });

  test(`${locale} has no keys the English catalog lacks`, () => {
    const extra = Object.keys(catalog).filter((key) => !(key in english));
    assert.deepEqual(extra, [], `${locale} has stale key(s): ${extra.join(', ')}`);
  });

  // A dropped {amount} renders the sentence without the number in it, and a
  // dropped <a> loses a link the sentence is still telling the reader to use.
  test(`${locale} keeps placeholders and markup`, () => {
    for (const [key, source] of Object.entries(english)) {
      const translated = catalog[key];
      assert.deepEqual(placeholders(translated), placeholders(source),
        `${locale} ${key}: placeholders differ`);
      assert.deepEqual(tags(translated), tags(source),
        `${locale} ${key}: markup differs`);
    }
  });
}
