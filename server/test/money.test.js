import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Loaded for the side effect, the same way the page loads it: the file binds
// itself onto globalThis rather than exporting.
await import('../src/public/money.js');
const M = globalThis.Money;

const here = path.dirname(fileURLToPath(import.meta.url));

/*
 * The bug this file exists to prevent: the web client used to format every
 * amount as USD, so Intl helpfully disambiguated the dollar and a budget kept
 * in Calgary read "US$161.00". The phones never had it — they ask the platform
 * for the device's currency — so the fix was to do the same here.
 */
test('writes an amount in the reader country currency', () => {
  assert.equal(M.format(161, 'en-CA'), '$161.00');
  assert.equal(M.format(161, 'en-US'), '$161.00');
  assert.ok(M.format(161, 'de-DE').includes('€'), 'Germany should see euros');
  assert.ok(M.format(161, 'en-GB').includes('£'), 'Britain should see pounds');
});

test('never labels an amount American outside America', () => {
  for (const locale of ['en-CA', 'en-GB', 'en-AU', 'fr-CA', 'zh-CN', 'pt-BR']) {
    assert.ok(!M.format(161, locale).includes('US'), `${locale} says US`);
  }
});

// About half the browsers that ask for a page send a bare language with no
// country on it. CLDR's likely subtags are the same guess the phones make.
test('resolves a language with no country', () => {
  assert.equal(M.currencyFor('en'), 'USD');
  assert.equal(M.currencyFor('pt'), 'BRL');
  assert.equal(M.currencyFor('ja'), 'JPY');
  assert.equal(M.regionOf('fr'), 'FR');
});

// Every language the site is offered in has to resolve to something, or the
// reader gets the fallback instead of their own currency.
test('every language the site ships in resolves to a currency', () => {
  const source = fs.readFileSync(path.join(here, '..', 'src', 'i18n.ts'), 'utf8');
  const locales = source
    .slice(source.indexOf('export const LOCALES'), source.indexOf('] as const'))
    .match(/'([\w-]+)'/g)
    .map((quoted) => quoted.replaceAll("'", ''));

  for (const locale of locales) {
    assert.ok(M.currencyFor(locale), `${locale} has no currency`);
  }
});

// Yen has no minor unit, and rounding to two decimals in Tokyo looks as wrong
// as dropping them in Toronto. Intl knows the digits; the old code hard-coded
// two of them.
test('uses the fraction digits the currency actually has', () => {
  assert.ok(!M.format(161, 'ja-JP').includes('.'), 'yen should show no cents');
  assert.ok(M.format(161, 'en-CA').endsWith('.00'), 'dollars should show cents');
});

test('an unlisted country still gets a symbol, and not an American one', () => {
  const formatted = M.format(1234.5, 'en-AQ');
  assert.equal(M.currencyFor('en-AQ'), null);
  assert.ok(formatted.includes('$'), formatted);
  assert.ok(!formatted.includes('US'), formatted);
  assert.ok(formatted.includes('1,234.50'), formatted);
});

test('the table holds region codes against currency codes', () => {
  const upper = (text) => text === text.toUpperCase();
  for (const [region, currency] of Object.entries(M.CURRENCY_BY_REGION)) {
    assert.ok(region.length === 2 && upper(region), `${region} is not a region`);
    assert.ok(currency.length === 3 && upper(currency), `${currency} is not a currency`);
  }
});
