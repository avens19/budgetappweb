import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The page loads this with a <script> tag and it binds itself onto globalThis,
// so importing it for the side effect gives this suite the same object the
// browser gets, with no DOM in the way.
await import('../src/public/weekly-number.js');
const W = globalThis.WeeklyNumber;

const period = (key) => W.periodByKey('js.planner.period.' + key);

test('annualises each period', () => {
  assert.equal(W.perYear('100', period('weekly')), 5200);
  assert.equal(W.perYear('100', period('fortnightly')), 2600);
  assert.equal(W.perYear('100', period('semiMonthly')), 2400);
  assert.equal(W.perYear('100', period('monthly')), 1200);
  assert.equal(W.perYear('100', period('yearly')), 100);
});

// The prompts are all optional, so most of them arrive empty. None of that is
// an error; it is zero.
test('treats unusable amounts as nothing', () => {
  for (const value of ['', '   ', null, undefined, '.', 'twelve', 'Infinity', 'NaN']) {
    assert.equal(W.perYear(value, period('monthly')), 0, `${value} should be zero`);
  }
});

test('reads a comma decimal separator', () => {
  assert.equal(W.perYear('12,50', period('monthly')), 150);
});

// The headline sum. Pay every two weeks, bills monthly, insurance yearly: the
// three cycles that make "a month is four weeks" wrong.
test('divides what is left across fifty-two weeks', () => {
  const income = W.perYear('2000', period('fortnightly'));
  const outgoing = W.perYear('1500', period('monthly')) + W.perYear('1200', period('yearly'));

  assert.equal(income, 52000);
  assert.equal(outgoing, 19200);
  assert.ok(Math.abs(W.weekly(income, outgoing) - 630.769230) < 0.000001);
});

// Spending more than you earn is the finding the page exists to surface, so it
// comes back negative rather than floored at zero.
test('reports a shortfall as negative', () => {
  assert.ok(W.weekly(12000, 24000) < 0);
});

// The three clients ask the same questions in the same order, so that a number
// worked out on one is reproducible on the others.
test('asks seventeen prompts in three groups', () => {
  assert.equal(W.GROUPS.length, 3);
  assert.equal(W.GROUPS.reduce((n, g) => n + g.lines.length, 0), 17);
  assert.equal(W.GROUPS.filter((g) => g.income).length, 1);
  assert.equal(W.GROUPS[0].lines[0].key, 'js.planner.line.pay');
});

test('every prompt names a period that exists', () => {
  for (const group of W.GROUPS) {
    for (const line of group.lines) {
      assert.ok(W.PERIODS.some((p) => p.key === line.period),
        `${line.key} has an unknown period ${line.period}`);
    }
  }
});

// The module holds keys, not words: an English label here is a string the
// translations never reach, which is how the German page kept saying
// "Take-home pay".
test('every label is a catalog key', () => {
  const keys = [
    ...W.PERIODS.map((p) => p.key),
    ...W.GROUPS.flatMap((g) => [g.title, g.help, ...g.lines.map((l) => l.key)]),
  ];
  for (const key of keys) {
    assert.match(key, /^js\.planner\./, `${key} is not a catalog key`);
  }

  const english = JSON.parse(
    fs.readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
  for (const key of keys) {
    assert.ok(key in english, `${key} is missing from the English catalog`);
  }
});
