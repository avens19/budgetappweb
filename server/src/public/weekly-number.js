/*
 * The arithmetic behind "what should my weekly number be", and the prompts it
 * asks. No DOM in here: the page binds to it, and test/weeklyNumber.test.js
 * runs it in Node.
 *
 * Everything is annualised before it is compared. Amounts arrive on wildly
 * different cycles — pay every two weeks, rent monthly, insurance yearly — and
 * the usual shortcut of calling a month "four weeks" loses four weeks a year,
 * about 8% of the budget.
 *
 * The prompts are named rather than left as blank "income" and "expenses"
 * boxes because the failure mode of this sum is omission: nobody forgets the
 * rent, everybody forgets the car insurance until they are asked about it.
 *
 * Structure only: every label here is a catalog key that the page resolves
 * through t(). Holding the English in this file is what left the German render
 * of the page asking for "Take-home pay".
 *
 * It binds itself onto globalThis rather than exporting: the page loads it with
 * a plain <script> tag, and the server's package is ESM, so a module.exports
 * fallback would not even parse in the test. The test imports the file for the
 * side effect and reads the same global the browser gets.
 */
(function (root) {
  'use strict';

  var WEEKS_PER_YEAR = 52;
  var MONTHS_PER_YEAR = 12;

  var PERIODS = [
    { key: 'js.planner.period.weekly', perYear: 52 },
    { key: 'js.planner.period.fortnightly', perYear: 26 },
    { key: 'js.planner.period.semiMonthly', perYear: 24 },
    { key: 'js.planner.period.monthly', perYear: 12 },
    { key: 'js.planner.period.yearly', perYear: 1 }
  ];

  /* Steady spending comes last and is the one group that is genuinely optional
   * in both directions: subtracting groceries here makes the weekly number
   * smaller and the app quieter, leaving them out makes it larger and they get
   * tracked week to week. Either is coherent; doing both is not, which is why
   * the heading says so. */
  var GROUPS = [
    {
      key: 'income',
      title: 'js.planner.group.income.title',
      help: 'js.planner.group.income.help',
      income: true,
      lines: [
        { key: 'js.planner.line.pay', period: 'js.planner.period.fortnightly' },
        { key: 'js.planner.line.otherIncome', period: 'js.planner.period.monthly' }
      ]
    },
    {
      key: 'fixed',
      title: 'js.planner.group.fixed.title',
      help: 'js.planner.group.fixed.help',
      income: false,
      lines: [
        { key: 'js.planner.line.housing', period: 'js.planner.period.monthly' },
        { key: 'js.planner.line.utilities', period: 'js.planner.period.monthly' },
        { key: 'js.planner.line.phone', period: 'js.planner.period.monthly' },
        { key: 'js.planner.line.insurance', period: 'js.planner.period.monthly' },
        { key: 'js.planner.line.transport', period: 'js.planner.period.monthly' },
        { key: 'js.planner.line.debt', period: 'js.planner.period.monthly' },
        { key: 'js.planner.line.subscriptions', period: 'js.planner.period.monthly' },
        { key: 'js.planner.line.childcare', period: 'js.planner.period.monthly' },
        { key: 'js.planner.line.savings', period: 'js.planner.period.monthly' },
        { key: 'js.planner.line.otherFixed', period: 'js.planner.period.monthly' }
      ]
    },
    {
      key: 'steady',
      title: 'js.planner.group.steady.title',
      help: 'js.planner.group.steady.help',
      income: false,
      lines: [
        { key: 'js.planner.line.groceries', period: 'js.planner.period.weekly' },
        { key: 'js.planner.line.fuel', period: 'js.planner.period.weekly' },
        { key: 'js.planner.line.household', period: 'js.planner.period.monthly' },
        { key: 'js.planner.line.pets', period: 'js.planner.period.monthly' },
        { key: 'js.planner.line.otherSteady', period: 'js.planner.period.monthly' }
      ]
    }
  ];

  function periodByKey(key) {
    for (var i = 0; i < PERIODS.length; i++) {
      if (PERIODS[i].key === key) { return PERIODS[i]; }
    }
    return PERIODS[3];
  }

  /* A blank or unparseable box is zero rather than an error: the form is
   * seventeen prompts and most people will answer six of them. A comma is a
   * decimal separator here — the input is type=number, so it can only have come
   * from a keyboard that produces one. */
  function parse(amount) {
    if (amount === null || amount === undefined) { return 0; }
    var value = parseFloat(String(amount).trim().replace(',', '.'));
    return isFinite(value) ? value : 0;
  }

  function perYear(amount, period) {
    return parse(amount) * period.perYear;
  }

  /* Can come out negative, and is returned that way. Rounding it up to zero
   * would hide the only finding that matters — that the fixed costs as entered
   * do not fit inside the income — behind a budget of nothing. */
  function weekly(incomePerYear, outgoingPerYear) {
    return (incomePerYear - outgoingPerYear) / WEEKS_PER_YEAR;
  }

  root.WeeklyNumber = {
    WEEKS_PER_YEAR: WEEKS_PER_YEAR,
    MONTHS_PER_YEAR: MONTHS_PER_YEAR,
    PERIODS: PERIODS,
    GROUPS: GROUPS,
    periodByKey: periodByKey,
    parse: parse,
    perYear: perYear,
    weekly: weekly
  };
}(globalThis));
