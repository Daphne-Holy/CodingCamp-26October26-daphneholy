// Smoke test for Task 1.1: validates that the ES module exports are wired
// correctly and the testing infrastructure (Vitest + fast-check) can import
// the pure Data Layer constants and state model from js/app.js.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CATEGORIES,
  MAX_TRANSACTIONS_RENDER,
  AMOUNT_MIN,
  AMOUNT_MAX,
  BUDGET_MIN,
  BUDGET_MAX,
  ITEM_NAME_MAX,
  CUSTOM_CATEGORY_NAME_MIN,
  CUSTOM_CATEGORY_NAME_MAX,
  CUSTOM_CATEGORY_MAX_COUNT,
  APPROACHING_LIMIT_RATIO,
  STORAGE_KEY,
  initialState,
  createInitialState
} from '../js/app.js';

describe('Task 1.1 setup smoke test', () => {
  it('exports the Default Categories Food, Transport, Fun', () => {
    expect(DEFAULT_CATEGORIES).toEqual(['Food', 'Transport', 'Fun']);
  });

  it('exports expected numeric constants', () => {
    expect(MAX_TRANSACTIONS_RENDER).toBe(1000);
    expect(AMOUNT_MIN).toBe(0.01);
    expect(AMOUNT_MAX).toBe(999999999.99);
    expect(BUDGET_MIN).toBe(0.01);
    expect(BUDGET_MAX).toBe(999999999.99);
    expect(ITEM_NAME_MAX).toBe(100);
    expect(CUSTOM_CATEGORY_NAME_MIN).toBe(1);
    expect(CUSTOM_CATEGORY_NAME_MAX).toBe(50);
    expect(CUSTOM_CATEGORY_MAX_COUNT).toBe(100);
    expect(APPROACHING_LIMIT_RATIO).toBe(0.80);
  });

  it('exports the Local Storage key', () => {
    expect(STORAGE_KEY).toBe('expenseBudgetVisualizer.state.v1');
  });

  it('provides a well-formed initial state', () => {
    expect(initialState).toEqual({
      transactions: [],
      monthlyBudget: 0,
      customCategories: [],
      sortState: { field: null, direction: null }
    });
  });

  it('createInitialState returns an independent deep copy', () => {
    const copy = createInitialState();
    expect(copy).toEqual(initialState);
    expect(copy).not.toBe(initialState);
    expect(copy.sortState).not.toBe(initialState.sortState);
  });
});
