// Unit tests for Task 2.1: validation and category functions in the pure
// Data Layer. These cover specific examples and boundary/edge cases
// (empty-name rejection, boundary amounts, decimal-place checks, custom
// category length/count/duplicate rules) complementing the property-based
// tests added in later tasks.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CATEGORIES,
  ITEM_NAME_MAX,
  CUSTOM_CATEGORY_NAME_MAX,
  CUSTOM_CATEGORY_MAX_COUNT,
  createInitialState,
  allCategories,
  validateTransaction,
  validateBudget,
  validateCustomCategory,
  setBudget,
  addCustomCategory
} from '../js/app.js';

// Helper: build a state with the given custom categories.
function stateWith(customCategories = []) {
  const s = createInitialState();
  s.customCategories = [...customCategories];
  return s;
}

// Helper: produce a string of exactly n characters.
function repeat(str, n) {
  return str.repeat(n);
}

describe('allCategories', () => {
  it('returns defaults followed by customs in order', () => {
    expect(allCategories(stateWith(['Books', 'Gifts']))).toEqual([
      'Food', 'Transport', 'Fun', 'Books', 'Gifts'
    ]);
  });

  it('returns only defaults when there are no custom categories', () => {
    expect(allCategories(createInitialState())).toEqual([...DEFAULT_CATEGORIES]);
  });

  it('does not mutate the input state', () => {
    const s = stateWith(['Books']);
    const before = s.customCategories;
    allCategories(s);
    expect(s.customCategories).toBe(before);
  });
});

describe('validateTransaction', () => {
  it('accepts a well-formed transaction', () => {
    const r = validateTransaction('Lunch', 12.5, 'Food', createInitialState());
    expect(r).toEqual({ valid: true, field: null });
  });

  it('accepts a custom category', () => {
    const r = validateTransaction('Novel', 9.99, 'Books', stateWith(['Books']));
    expect(r).toEqual({ valid: true, field: null });
  });

  it('rejects an empty item name', () => {
    expect(validateTransaction('', 5, 'Food', createInitialState()))
      .toEqual({ valid: false, field: 'itemName' });
  });

  it('rejects a whitespace-only item name', () => {
    expect(validateTransaction('   ', 5, 'Food', createInitialState()))
      .toEqual({ valid: false, field: 'itemName' });
  });

  it('accepts an item name of exactly 100 characters', () => {
    const name = repeat('a', ITEM_NAME_MAX);
    expect(validateTransaction(name, 5, 'Food', createInitialState()))
      .toEqual({ valid: true, field: null });
  });

  it('rejects an item name exceeding 100 characters', () => {
    const name = repeat('a', ITEM_NAME_MAX + 1);
    expect(validateTransaction(name, 5, 'Food', createInitialState()))
      .toEqual({ valid: false, field: 'itemName' });
  });

  it('accepts the minimum amount 0.01', () => {
    expect(validateTransaction('X', 0.01, 'Food', createInitialState()))
      .toEqual({ valid: true, field: null });
  });

  it('accepts the maximum amount 999999999.99', () => {
    expect(validateTransaction('X', 999999999.99, 'Food', createInitialState()))
      .toEqual({ valid: true, field: null });
  });

  it('rejects a zero amount', () => {
    expect(validateTransaction('X', 0, 'Food', createInitialState()))
      .toEqual({ valid: false, field: 'amount' });
  });

  it('rejects a negative amount', () => {
    expect(validateTransaction('X', -5, 'Food', createInitialState()))
      .toEqual({ valid: false, field: 'amount' });
  });

  it('rejects an amount exceeding the maximum', () => {
    expect(validateTransaction('X', 1000000000, 'Food', createInitialState()))
      .toEqual({ valid: false, field: 'amount' });
  });

  it('rejects a non-numeric amount', () => {
    expect(validateTransaction('X', 'abc', 'Food', createInitialState()))
      .toEqual({ valid: false, field: 'amount' });
  });

  it('rejects NaN and Infinity amounts', () => {
    expect(validateTransaction('X', NaN, 'Food', createInitialState()))
      .toEqual({ valid: false, field: 'amount' });
    expect(validateTransaction('X', Infinity, 'Food', createInitialState()))
      .toEqual({ valid: false, field: 'amount' });
  });

  it('accepts a numeric string amount', () => {
    expect(validateTransaction('X', '12.50', 'Food', createInitialState()))
      .toEqual({ valid: true, field: null });
  });

  it('rejects an unknown category', () => {
    expect(validateTransaction('X', 5, 'Unknown', createInitialState()))
      .toEqual({ valid: false, field: 'category' });
  });

  it('identifies the first invalid field when multiple are invalid', () => {
    // Empty name and bad amount -> itemName is reported first.
    expect(validateTransaction('', 0, 'Unknown', createInitialState()))
      .toEqual({ valid: false, field: 'itemName' });
  });
});

describe('validateBudget', () => {
  it('accepts a normal budget', () => {
    expect(validateBudget(500)).toEqual({ valid: true });
  });

  it('accepts the minimum 0.01', () => {
    expect(validateBudget(0.01)).toEqual({ valid: true });
  });

  it('accepts the maximum 999999999.99', () => {
    expect(validateBudget(999999999.99)).toEqual({ valid: true });
  });

  it('accepts a numeric string', () => {
    expect(validateBudget('250.5')).toEqual({ valid: true });
  });

  it('accepts a value with exactly two decimal places', () => {
    expect(validateBudget('100.55')).toEqual({ valid: true });
  });

  it('rejects zero', () => {
    expect(validateBudget(0)).toEqual({ valid: false });
  });

  it('rejects a value below the minimum', () => {
    expect(validateBudget(0.005)).toEqual({ valid: false });
  });

  it('rejects a value above the maximum', () => {
    expect(validateBudget(1000000000)).toEqual({ valid: false });
  });

  it('rejects a value with more than two decimal places', () => {
    expect(validateBudget('100.555')).toEqual({ valid: false });
  });

  it('rejects a non-numeric value', () => {
    expect(validateBudget('abc')).toEqual({ valid: false });
  });

  it('rejects NaN and Infinity', () => {
    expect(validateBudget(NaN)).toEqual({ valid: false });
    expect(validateBudget(Infinity)).toEqual({ valid: false });
  });
});

describe('setBudget', () => {
  it('returns a new state with the updated budget on success', () => {
    const s = createInitialState();
    const result = setBudget(s, 500);
    expect(result.error).toBeNull();
    expect(result.state.monthlyBudget).toBe(500);
  });

  it('does not mutate the original state on success', () => {
    const s = createInitialState();
    setBudget(s, 500);
    expect(s.monthlyBudget).toBe(0);
  });

  it('returns the original state reference and error on invalid value', () => {
    const s = createInitialState();
    const result = setBudget(s, 'abc');
    expect(result.error).toBe(true);
    expect(result.state).toBe(s);
  });
});

describe('validateCustomCategory', () => {
  it('accepts a valid new name', () => {
    expect(validateCustomCategory(stateWith([]), 'Books'))
      .toEqual({ valid: true, reason: null });
  });

  it('accepts a name of exactly 50 characters', () => {
    const name = repeat('a', CUSTOM_CATEGORY_NAME_MAX);
    expect(validateCustomCategory(stateWith([]), name))
      .toEqual({ valid: true, reason: null });
  });

  it('rejects an empty name with reason length', () => {
    expect(validateCustomCategory(stateWith([]), ''))
      .toEqual({ valid: false, reason: 'length' });
  });

  it('rejects a whitespace-only name with reason length', () => {
    expect(validateCustomCategory(stateWith([]), '   '))
      .toEqual({ valid: false, reason: 'length' });
  });

  it('rejects a name exceeding 50 characters with reason length', () => {
    const name = repeat('a', CUSTOM_CATEGORY_NAME_MAX + 1);
    expect(validateCustomCategory(stateWith([]), name))
      .toEqual({ valid: false, reason: 'length' });
  });

  it('rejects a name matching a default category with reason duplicate', () => {
    expect(validateCustomCategory(stateWith([]), 'Food'))
      .toEqual({ valid: false, reason: 'duplicate' });
  });

  it('rejects a name matching an existing custom category with reason duplicate', () => {
    expect(validateCustomCategory(stateWith(['Books']), 'Books'))
      .toEqual({ valid: false, reason: 'duplicate' });
  });

  it('rejects when 100 custom categories already exist with reason limit', () => {
    const customs = Array.from({ length: CUSTOM_CATEGORY_MAX_COUNT }, (_, i) => `Cat${i}`);
    expect(validateCustomCategory(stateWith(customs), 'NewOne'))
      .toEqual({ valid: false, reason: 'limit' });
  });

  it('accepts when 99 custom categories exist and a new name is added', () => {
    const customs = Array.from({ length: CUSTOM_CATEGORY_MAX_COUNT - 1 }, (_, i) => `Cat${i}`);
    expect(validateCustomCategory(stateWith(customs), 'NewOne'))
      .toEqual({ valid: true, reason: null });
  });
});

describe('addCustomCategory', () => {
  it('returns a new state with the trimmed name appended on success', () => {
    const s = stateWith(['Books']);
    const result = addCustomCategory(s, '  Gifts  ');
    expect(result.error).toBeNull();
    expect(result.state.customCategories).toEqual(['Books', 'Gifts']);
  });

  it('does not mutate the original state on success', () => {
    const s = stateWith(['Books']);
    addCustomCategory(s, 'Gifts');
    expect(s.customCategories).toEqual(['Books']);
  });

  it('returns the original state reference and reason on invalid name', () => {
    const s = stateWith([]);
    const result = addCustomCategory(s, 'Food');
    expect(result.error).toBe('duplicate');
    expect(result.state).toBe(s);
  });

  it('returns reason length for an empty name', () => {
    const s = stateWith([]);
    const result = addCustomCategory(s, '');
    expect(result.error).toBe('length');
    expect(result.state).toBe(s);
  });

  it('returns reason limit when the custom category count is at the max', () => {
    const customs = Array.from({ length: CUSTOM_CATEGORY_MAX_COUNT }, (_, i) => `Cat${i}`);
    const s = stateWith(customs);
    const result = addCustomCategory(s, 'NewOne');
    expect(result.error).toBe('limit');
    expect(result.state).toBe(s);
  });
});
