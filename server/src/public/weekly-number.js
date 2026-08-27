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
    { label: 'Weekly', perYear: 52 },
    { label: 'Every 2 weeks', perYear: 26 },
    { label: 'Twice a month', perYear: 24 },
    { label: 'Monthly', perYear: 12 },
    { label: 'Yearly', perYear: 1 }
  ];

  /* Steady spending comes last and is the one group that is genuinely optional
   * in both directions: subtracting groceries here makes the weekly number
   * smaller and the app quieter, leaving them out makes it larger and they get
   * tracked week to week. Either is coherent; doing both is not, which is why
   * the heading says so. */
  var GROUPS = [
    {
      title: 'Money coming in',
      help: 'What actually lands in the account, after tax and deductions.',
      income: true,
      lines: [
        { label: 'Take-home pay', period: 'Every 2 weeks' },
        { label: 'Other income', period: 'Monthly' }
      ]
    },
    {
      title: "Bills that don't change",
      help: 'The amounts that go out whether you think about them or not. Savings '
          + 'belongs here too: money you have decided not to spend is not spending money.',
      income: false,
      lines: [
        { label: 'Rent or mortgage', period: 'Monthly' },
        { label: 'Power, heat, water', period: 'Monthly' },
        { label: 'Phone and internet', period: 'Monthly' },
        { label: 'Insurance', period: 'Monthly' },
        { label: 'Car payment or transit pass', period: 'Monthly' },
        { label: 'Loan and credit payments', period: 'Monthly' },
        { label: 'Subscriptions', period: 'Monthly' },
        { label: 'Childcare or school fees', period: 'Monthly' },
        { label: 'Savings', period: 'Monthly' },
        { label: 'Anything else fixed', period: 'Monthly' }
      ]
    },
    {
      title: 'Steady spending (optional)',
      help: 'Things that vary a little but never surprise you. Subtract them here and '
          + 'they stay off the week screen; leave them blank and enter them week to week '
          + 'instead. One or the other, not both.',
      income: false,
      lines: [
        { label: 'Groceries', period: 'Weekly' },
        { label: 'Fuel or fares', period: 'Weekly' },
        { label: 'Household and toiletries', period: 'Monthly' },
        { label: 'Pets', period: 'Monthly' },
        { label: 'Anything else steady', period: 'Monthly' }
      ]
    }
  ];

  function periodByLabel(label) {
    for (var i = 0; i < PERIODS.length; i++) {
      if (PERIODS[i].label === label) { return PERIODS[i]; }
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
    periodByLabel: periodByLabel,
    parse: parse,
    perYear: perYear,
    weekly: weekly
  };
}(globalThis));
