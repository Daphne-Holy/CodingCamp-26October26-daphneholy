// Unit tests for Task 5.1: derived value functions in the pure Data Layer.
// Covers totalExpenses, remainingBudget, warningState, categoryTotals, and
// currentMonthTotalExpenses with specific examples and edge cases (empty
// state, the 80% approaching threshold boundary, exactly-100% boundary,
// overspend with a negative remaining budget, multi-category aggregation, and
// month/year filtering for the monthly summary).
import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  totalExpenses,
  remainingBudget,
  warningState,
  categoryTotals,
  currentMonthTotalExpenses
} from '../js/app.js';

// Helper: build a transaction object with a known id/order, allowing explicit
// control of `createdAt` (needed for currentMonthTotalExpenses tests).
function tx(id, itemName, amount, category, createdAt) {
  return { id, itemName, amount, category, createdAt };
}

// Helper: build a fresh state with the given transactions and optional budget.
function stateWith(transactions, monthlyBudget = 0) {
  const s = createInitialState();
  s.transactions = transactions;
  s.monthlyBudget = monthlyBudget;
  return s;
}

describe('totalExpenses', () => {
  it('returns 0 when there are no transactions', () => {
    expect(totalExpenses(createInitialState())).toBe(0);
  });

  it('returns the sum of all transaction amounts', () => {
    const s = stateWith([
      tx(1, 'A', 10, 'Food', 1),
      tx(2, 'B', 20.5, 'Food', 2),
      tx(3, 'C', 0.5, 'Transport', 3)
    ]);
    expect(totalExpenses(s)).toBeCloseTo(31, 10);
  });

  it('does not mutate the input state', () => {
    const s = stateWith([tx(1, 'A', 10, 'Food', 1)]);
    totalExpenses(s);
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0].amount).toBe(10);
  });
});

describe('remainingBudget', () => {
  it('returns the monthly budget when there are no transactions', () => {
    const s = stateWith([], 500);
    expect(remainingBudget(s)).toBe(500);
  });

  it('returns the budget minus total expenses', () => {
    const s = stateWith([tx(1, 'A', 100, 'Food', 1)], 500);
    expect(remainingBudget(s)).toBe(400);
  });

  it('can be negative when expenses exceed the budget', () => {
    const s = stateWith([tx(1, 'A', 600, 'Food', 1)], 500);
    expect(remainingBudget(s)).toBe(-100);
  });

  it('returns 0 when the budget equals total expenses', () => {
    const s = stateWith([tx(1, 'A', 500, 'Food', 1)], 500);
    expect(remainingBudget(s)).toBe(0);
  });

  it('does not mutate the input state', () => {
    const s = stateWith([tx(1, 'A', 100, 'Food', 1)], 500);
    remainingBudget(s);
    expect(s.monthlyBudget).toBe(500);
    expect(s.transactions).toHaveLength(1);
  });
});

describe('warningState', () => {
  it('returns no-budget when the monthly budget is 0', () => {
    expect(warningState(stateWith([], 0))).toBe('no-budget');
  });

  it('returns no-budget when the monthly budget is negative', () => {
    expect(warningState(stateWith([], -10))).toBe('no-budget');
  });

  it('returns none when total expenses are below 80% of the budget', () => {
    // 399.99 / 500 = ~0.79998 (< 0.80)
    const s = stateWith([tx(1, 'A', 399.99, 'Food', 1)], 500);
    expect(warningState(s)).toBe('none');
  });

  it('returns approaching when total expenses are exactly at the 80% threshold', () => {
    // 400 / 500 = 0.80 (boundary -> approaching)
    const s = stateWith([tx(1, 'A', 400, 'Food', 1)], 500);
    expect(warningState(s)).toBe('approaching');
  });

  it('returns approaching when total expenses are between 80% and 100%', () => {
    // 450 / 500 = 0.90
    const s = stateWith([tx(1, 'A', 450, 'Food', 1)], 500);
    expect(warningState(s)).toBe('approaching');
  });

  it('returns approaching when total expenses are exactly 100% of the budget', () => {
    // 500 / 500 = 1.0 (boundary -> approaching, not overspend)
    const s = stateWith([tx(1, 'A', 500, 'Food', 1)], 500);
    expect(warningState(s)).toBe('approaching');
  });

  it('returns overspend when total expenses exceed the budget', () => {
    // 600 / 500 = 1.2 (> 1)
    const s = stateWith([tx(1, 'A', 600, 'Food', 1)], 500);
    expect(warningState(s)).toBe('overspend');
  });

  it('returns none when there are no transactions and a budget is set', () => {
    expect(warningState(stateWith([], 500))).toBe('none');
  });

  it('does not mutate the input state', () => {
    const s = stateWith([tx(1, 'A', 100, 'Food', 1)], 500);
    warningState(s);
    expect(s.transactions).toHaveLength(1);
    expect(s.monthlyBudget).toBe(500);
  });
});

describe('categoryTotals', () => {
  it('returns an empty object when there are no transactions', () => {
    expect(categoryTotals(createInitialState())).toEqual({});
  });

  it('aggregates amounts per category', () => {
    const s = stateWith([
      tx(1, 'A', 10, 'Food', 1),
      tx(2, 'B', 20, 'Food', 2),
      tx(3, 'C', 5, 'Transport', 3)
    ]);
    expect(categoryTotals(s)).toEqual({ Food: 30, Transport: 5 });
  });

  it('handles a single category', () => {
    const s = stateWith([tx(1, 'A', 10, 'Fun', 1)]);
    expect(categoryTotals(s)).toEqual({ Fun: 10 });
  });

  it('sums across multiple distinct categories', () => {
    const s = stateWith([
      tx(1, 'A', 1.5, 'Food', 1),
      tx(2, 'B', 2.5, 'Transport', 2),
      tx(3, 'C', 3, 'Fun', 3)
    ]);
    expect(categoryTotals(s)).toEqual({ Food: 1.5, Transport: 2.5, Fun: 3 });
  });

  it('does not mutate the input state', () => {
    const s = stateWith([tx(1, 'A', 10, 'Food', 1)]);
    categoryTotals(s);
    expect(s.transactions).toHaveLength(1);
  });
});

describe('currentMonthTotalExpenses', () => {
  // Use a fixed reference time so month/year filtering is deterministic.
  // March 15, 2024 12:00 UTC -> epoch ms.
  const NOW = new Date(2024, 2, 15, 12, 0, 0).getTime(); // month index 2 = March

  it('returns 0 when there are no transactions', () => {
    expect(currentMonthTotalExpenses(createInitialState(), NOW)).toBe(0);
  });

  it('sums transactions whose createdAt falls in the current calendar month', () => {
    const s = stateWith([
      tx(1, 'A', 10, 'Food', new Date(2024, 2, 1).getTime()),   // March 2024
      tx(2, 'B', 20, 'Food', new Date(2024, 2, 31).getTime()),  // March 2024
      tx(3, 'C', 100, 'Food', new Date(2024, 1, 15).getTime()) // February 2024 (excluded)
    ]);
    expect(currentMonthTotalExpenses(s, NOW)).toBe(30);
  });

  it('excludes transactions from a different month of the same year', () => {
    const s = stateWith([
      tx(1, 'A', 10, 'Food', new Date(2024, 0, 15).getTime()),  // January 2024 (excluded)
      tx(2, 'B', 50, 'Food', new Date(2024, 2, 15).getTime())  // March 2024 (included)
    ]);
    expect(currentMonthTotalExpenses(s, NOW)).toBe(50);
  });

  it('excludes transactions from the same month in a different year', () => {
    const s = stateWith([
      tx(1, 'A', 10, 'Food', new Date(2023, 2, 15).getTime()),  // March 2023 (excluded)
      tx(2, 'B', 50, 'Food', new Date(2024, 2, 15).getTime())   // March 2024 (included)
    ]);
    expect(currentMonthTotalExpenses(s, NOW)).toBe(50);
  });

  it('returns 0 when no transactions fall in the current month', () => {
    const s = stateWith([
      tx(1, 'A', 10, 'Food', new Date(2024, 1, 15).getTime()), // February 2024
      tx(2, 'B', 20, 'Food', new Date(2023, 2, 15).getTime())  // March 2023
    ]);
    expect(currentMonthTotalExpenses(s, NOW)).toBe(0);
  });

  it('defaults now to Date.now() when omitted', () => {
    // A transaction created "now" should be counted in the current month.
    const realNow = Date.now();
    const s = stateWith([tx(1, 'A', 42, 'Food', realNow)]);
    // Allow a few ms of slack in case Date.now() ticks over a month boundary
    // mid-test; in practice this is the same calendar month.
    expect(currentMonthTotalExpenses(s)).toBe(42);
  });

  it('does not mutate the input state', () => {
    const s = stateWith([tx(1, 'A', 10, 'Food', new Date(2024, 2, 15).getTime())]);
    currentMonthTotalExpenses(s, NOW);
    expect(s.transactions).toHaveLength(1);
  });
});
