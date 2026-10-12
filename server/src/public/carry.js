/*
 * The sums behind carrying a week's balance into the next one. No DOM in here:
 * the week page binds to it, and test/carry.test.js runs it in Node.
 *
 * A carry is an expense on the first day of the following week, flagged
 * IsSystem. Its amount is the negative of what was left, so a surplus lowers
 * next week's spending and a deficit (a positive amount) raises it. That is the
 * shape the phone apps write, so all three clients read each other's carries.
 *
 * It binds itself onto globalThis rather than exporting, for the reason given
 * in weekly-number.js: the page loads it with a plain <script> tag.
 */
(function (root) {
  'use strict';

  function cents(value) {
    return Math.round(value * 100) / 100;
  }

  /** What was left of a week: negative when it was overspent. */
  function balance(limit, expenses) {
    var spent = 0;
    for (var i = 0; i < expenses.length; i++) {
      spent += expenses[i].Amount;
    }
    return cents(limit - spent);
  }

  /**
   * The amount of the carry expense, or 0 when there is nothing worth writing.
   *
   * Under a cent either way is rounding noise, and a "Carried Balance" row of
   * $0.00 is clutter.
   */
  function amountToCarry(limit, expenses) {
    var left = balance(limit, expenses);
    if (Math.abs(left) < 0.01) { return 0; }
    return -left;
  }

  /** Whether any of these is a carry, i.e. the week has already been written. */
  function hasCarry(expenses) {
    for (var i = 0; i < expenses.length; i++) {
      if (expenses[i].IsSystem && !expenses[i].IsDeleted) { return true; }
    }
    return false;
  }

  /**
   * A budget with nothing before this week has nothing to carry from. Without
   * this a budget created today would open next week with a whole extra week's
   * allowance, because an empty week looks like a week that went unspent.
   *
   * Compared as yyyy-MM-dd text, not as instants: a Date arrives as UTC
   * midnight, and reading it as a moment would put it on the wrong side of a
   * local midnight for anyone west of Greenwich.
   */
  function hasEarlierExpense(expenses, weekStartDate) {
    for (var i = 0; i < expenses.length; i++) {
      if (!expenses[i].IsDeleted && String(expenses[i].Date).slice(0, 10) < weekStartDate) {
        return true;
      }
    }
    return false;
  }

  root.Carry = {
    balance: balance,
    amountToCarry: amountToCarry,
    hasCarry: hasCarry,
    hasEarlierExpense: hasEarlierExpense
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
