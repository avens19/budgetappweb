import test from 'node:test';
import assert from 'node:assert/strict';

// Loaded for the side effect, the same way the page loads it: the file binds
// itself onto globalThis rather than exporting.
await import('../src/public/carry.js');
const C = globalThis.Carry;

const spend = (...amounts) => amounts.map((Amount) => ({ Amount }));

test('a week that was underspent carries a negative expense', () => {
  assert.equal(C.amountToCarry(200, spend(50, 25.5)), -124.5);
});

// The request that started this: a deficit has to follow the reader into the
// next week too, as a positive expense that uses some of it up.
test('a week that was overspent carries a positive expense', () => {
  assert.equal(C.amountToCarry(100, spend(80, 45.25)), 25.25);
});

test('counts a carry already in the week as spending', () => {
  // Last week opened with 30 carried in (-30), so 150 spent leaves 80 of 200.
  assert.equal(C.amountToCarry(200, spend(-30, 150)), -80);
});

test('carries nothing when the week came out even', () => {
  assert.equal(C.amountToCarry(100, spend(100)), 0);
  assert.equal(C.amountToCarry(100, spend(33.33, 66.67)), 0);
});

// Binary floating point: 0.1 + 0.2 is 0.30000000000000004, and a carry of
// $0.00 is clutter.
test('ignores rounding noise', () => {
  assert.equal(C.amountToCarry(0.3, spend(0.1, 0.2)), 0);
  assert.equal(C.amountToCarry(100, spend(99.996)), 0);
});

test('rounds to the cent', () => {
  assert.equal(C.amountToCarry(10, spend(3.333)), -6.67);
});

test('an empty week carries the whole allowance', () => {
  assert.equal(C.amountToCarry(120, []), -120);
});

test('recognises a carry already written', () => {
  assert.equal(C.hasCarry([]), false);
  assert.equal(C.hasCarry([{ IsSystem: false }]), false);
  assert.equal(C.hasCarry([{ IsSystem: false }, { IsSystem: true }]), true);
});

test('a deleted carry does not count as written', () => {
  assert.equal(C.hasCarry([{ IsSystem: true, IsDeleted: true }]), false);
});

// A budget made this week has nothing before it, and must not open next week
// with a free extra allowance.
test('needs an expense from before the week to have something to carry from', () => {
  const week = '2026-10-11';
  assert.equal(C.hasEarlierExpense([], week), false);
  assert.equal(C.hasEarlierExpense([{ Date: '2026-10-11T00:00:00Z' }], week), false);
  assert.equal(C.hasEarlierExpense([{ Date: '2026-10-10T00:00:00Z' }], week), true);
  assert.equal(C.hasEarlierExpense([{ Date: '2026-10-10T00:00:00Z', IsDeleted: true }], week), false);
});
