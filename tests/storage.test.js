// Unit + property-based tests for Task 7.1: the Storage Adapter (Persistence
// Layer). Covers isStorageAvailable, persistState, loadState, and
// normalizeLoadedState with specific examples and edge cases (corrupted-storage
// fallback, storage unavailability, quota-exceeded write failure, data round
// trip), plus a property-based test for Property 13 (data persistence round
// trip).
//
// The storage functions resolve the Local Storage handle lazily via
// `getStorage()`, which returns `null` when `window` is undefined (the default
// Node.js environment). To exercise the storage-available paths we inject a
// mock localStorage by assigning `global.window = { localStorage: mock }`; the
// functions then read `window.localStorage` at call time. Each describe block
// saves and restores `global.window` around its tests.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  DEFAULT_CATEGORIES,
  STORAGE_KEY,
  createInitialState,
  isStorageAvailable,
  persistState,
  loadState,
  normalizeLoadedState,
} from '../js/app.js';

// -----------------------------------------------------------------------------
// Mock localStorage helpers
// -----------------------------------------------------------------------------

/** In-memory localStorage backed by a Map; values are stored as strings. */
function createMockStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    _store: store,
  };
}

/** A storage that throws on every operation (simulates unavailable storage). */
function createThrowingStorage() {
  const boom = () => {
    throw new Error('storage unavailable');
  };
  return { getItem: boom, setItem: boom, removeItem: boom, clear: boom };
}

/** Save/restore `global.window` around a test so mocks never leak. */
function withWindowScope() {
  let saved;
  beforeEach(() => {
    saved = global.window;
  });
  afterEach(() => {
    if (saved === undefined) {
      delete global.window;
    } else {
      global.window = saved;
    }
  });
}

// -----------------------------------------------------------------------------
// isStorageAvailable
// -----------------------------------------------------------------------------

describe('isStorageAvailable', () => {
  withWindowScope();

  it('returns false when window/localStorage is undefined (Node.js)', () => {
    delete global.window;
    expect(isStorageAvailable()).toBe(false);
  });

  it('returns true when localStorage can set and remove a test key', () => {
    global.window = { localStorage: createMockStorage() };
    expect(isStorageAvailable()).toBe(true);
  });

  it('returns false when accessing localStorage throws (privacy mode)', () => {
    global.window = {
      get localStorage() {
        throw new Error('blocked');
      },
    };
    expect(isStorageAvailable()).toBe(false);
  });

  it('returns false when setItem throws', () => {
    global.window = { localStorage: createThrowingStorage() };
    expect(isStorageAvailable()).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// persistState
// -----------------------------------------------------------------------------

describe('persistState', () => {
  withWindowScope();

  it('writes JSON under STORAGE_KEY and returns ok on success', () => {
    const storage = createMockStorage();
    global.window = { localStorage: storage };
    const state = createInitialState();
    state.monthlyBudget = 500;
    const result = persistState(state);
    expect(result).toEqual({ ok: true, error: null });
    expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(state));
  });

  it('returns save_failed when the write throws (quota exceeded)', () => {
    global.window = { localStorage: createThrowingStorage() };
    const result = persistState(createInitialState());
    expect(result).toEqual({ ok: false, error: 'save_failed' });
  });

  it('returns save_failed when storage is unavailable (window undefined)', () => {
    delete global.window;
    const result = persistState(createInitialState());
    expect(result).toEqual({ ok: false, error: 'save_failed' });
  });

  it('does not mutate the input state', () => {
    const storage = createMockStorage();
    global.window = { localStorage: storage };
    const state = createInitialState();
    state.monthlyBudget = 500;
    state.transactions = [
      { id: 1, itemName: 'Lunch', amount: 12.5, category: 'Food', createdAt: 1 },
    ];
    const snapshot = JSON.parse(JSON.stringify(state));
    persistState(state);
    expect(state).toEqual(snapshot);
  });
});

// -----------------------------------------------------------------------------
// loadState
// -----------------------------------------------------------------------------

describe('loadState', () => {
  let storage;
  withWindowScope();

  beforeEach(() => {
    storage = createMockStorage();
    global.window = { localStorage: storage };
  });

  it('returns initialState with null error when no data exists', () => {
    const result = loadState();
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.state).toEqual(createInitialState());
  });

  it('returns the normalized state with null error when data parses', () => {
    const state = createInitialState();
    state.monthlyBudget = 500;
    state.transactions = [
      { id: 1, itemName: 'Lunch', amount: 12.5, category: 'Food', createdAt: 1730000000000 },
    ];
    state.customCategories = ['Books'];
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    const result = loadState();
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.state).toEqual(state);
  });

  it('returns initialState with load_corrupted when JSON is unparseable', () => {
    storage.setItem(STORAGE_KEY, '{not valid json');
    const result = loadState();
    expect(result.ok).toBe(true);
    expect(result.error).toBe('load_corrupted');
    expect(result.state).toEqual(createInitialState());
  });

  it('returns defaults with null error when storage is unavailable', () => {
    delete global.window;
    const result = loadState();
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.state).toEqual(createInitialState());
  });

  it('round trips a full state through persistState then loadState', () => {
    const state = createInitialState();
    state.monthlyBudget = 750;
    state.transactions = [
      { id: 1, itemName: 'Coffee', amount: 3.5, category: 'Food', createdAt: 1700000000000 },
      { id: 2, itemName: 'Bus', amount: 2.25, category: 'Transport', createdAt: 1700000001000 },
    ];
    state.customCategories = ['Books', 'Gifts'];
    state.sortState = { field: 'amount', direction: 'desc' };
    persistState(state);
    const result = loadState();
    expect(result.error).toBeNull();
    expect(result.state).toEqual(state);
  });

  it('returns a fresh, independent state (not the shared initialState)', () => {
    const result = loadState();
    expect(result.state).toEqual(createInitialState());
    expect(result.state).not.toBe(createInitialState());
  });
});

// -----------------------------------------------------------------------------
// normalizeLoadedState
// -----------------------------------------------------------------------------

describe('normalizeLoadedState', () => {
  it('falls back to initialState when parsed is not a plain object', () => {
    for (const bad of [null, undefined, 42, 'string', true, [1, 2, 3]]) {
      expect(normalizeLoadedState(bad)).toEqual(createInitialState());
    }
  });

  it('preserves a fully valid state exactly', () => {
    const state = {
      transactions: [
        { id: 1, itemName: 'Lunch', amount: 12.5, category: 'Food', createdAt: 1730000000000 },
        { id: 2, itemName: 'Bus', amount: 2.25, category: 'Transport', createdAt: 1730000001000 },
      ],
      monthlyBudget: 500,
      customCategories: ['Books'],
      sortState: { field: 'amount', direction: 'asc' },
    };
    expect(normalizeLoadedState(state)).toEqual(state);
  });

  it('discards transactions with non-numeric amounts', () => {
    const parsed = {
      transactions: [
        { id: 1, itemName: 'A', amount: 10, category: 'Food', createdAt: 1 },
        { id: 2, itemName: 'B', amount: 'NaN-string', category: 'Food', createdAt: 2 },
        { id: 3, itemName: 'C', amount: null, category: 'Food', createdAt: 3 },
        { id: 4, itemName: 'D', amount: undefined, category: 'Food', createdAt: 4 },
      ],
      monthlyBudget: 0,
      customCategories: [],
      sortState: { field: null, direction: null },
    };
    const result = normalizeLoadedState(parsed);
    expect(result.transactions).toEqual([
      { id: 1, itemName: 'A', amount: 10, category: 'Food', createdAt: 1 },
    ]);
  });

  it('discards transactions missing required fields', () => {
    const parsed = {
      transactions: [
        { id: 1, itemName: 'A', amount: 10, category: 'Food' }, // missing createdAt
        { id: 2, amount: 10, category: 'Food', createdAt: 2 }, // missing itemName
        'not-an-object',
        null,
        { id: 5, itemName: 'C', amount: 5, category: 'Fun', createdAt: 5 }, // valid
      ],
      monthlyBudget: 0,
      customCategories: [],
      sortState: { field: null, direction: null },
    };
    const result = normalizeLoadedState(parsed);
    expect(result.transactions).toEqual([
      { id: 5, itemName: 'C', amount: 5, category: 'Fun', createdAt: 5 },
    ]);
  });

  it('defaults monthlyBudget to 0 when it is not a finite non-negative number', () => {
    for (const bad of ['abc', null, undefined, true, -10, NaN, Infinity, '500']) {
      const result = normalizeLoadedState({
        transactions: [],
        monthlyBudget: bad,
        customCategories: [],
        sortState: { field: null, direction: null },
      });
      expect(result.monthlyBudget).toBe(0);
    }
  });

  it('preserves a valid monthlyBudget', () => {
    const result = normalizeLoadedState({
      transactions: [],
      monthlyBudget: 500,
      customCategories: [],
      sortState: { field: null, direction: null },
    });
    expect(result.monthlyBudget).toBe(500);
  });

  it('keeps only string entries in customCategories, in order', () => {
    const result = normalizeLoadedState({
      transactions: [],
      monthlyBudget: 0,
      customCategories: ['Books', 42, null, 'Gifts', undefined, 'Travel'],
      sortState: { field: null, direction: null },
    });
    expect(result.customCategories).toEqual(['Books', 'Gifts', 'Travel']);
  });

  it('resets sortState when it is malformed', () => {
    const result = normalizeLoadedState({
      transactions: [],
      monthlyBudget: 0,
      customCategories: [],
      sortState: 'oops',
    });
    expect(result.sortState).toEqual({ field: null, direction: null });
  });

  it('resets unknown sort field/direction values to null', () => {
    const result = normalizeLoadedState({
      transactions: [],
      monthlyBudget: 0,
      customCategories: [],
      sortState: { field: 'date', direction: 'up' },
    });
    expect(result.sortState).toEqual({ field: null, direction: null });
  });

  it('preserves valid sort field/direction combinations', () => {
    const result = normalizeLoadedState({
      transactions: [],
      monthlyBudget: 0,
      customCategories: [],
      sortState: { field: 'category', direction: 'desc' },
    });
    expect(result.sortState).toEqual({ field: 'category', direction: 'desc' });
  });

  it('returns a fresh independent state (not the shared initialState)', () => {
    const result = normalizeLoadedState('corrupt');
    expect(result).toEqual(createInitialState());
    expect(result).not.toBe(createInitialState());
  });

  it('handles a missing transactions field as an empty list', () => {
    const result = normalizeLoadedState({
      monthlyBudget: 100,
      customCategories: ['Books'],
      sortState: { field: null, direction: null },
    });
    expect(result.transactions).toEqual([]);
    expect(result.monthlyBudget).toBe(100);
  });
});

// -----------------------------------------------------------------------------
// Property 13: Data persistence round trip
// -----------------------------------------------------------------------------
// **Feature: expense-budget-visualizer, Property 13: Data persistence round
// trip** — For any valid state, serializing to local storage and deserializing
// SHALL produce an equivalent state (equal transactions, budget, custom
// categories, and sort state). Minimum 100 iterations.
//
// Validates: Requirements 3.2, 5.3, 7.1, 7.2, 7.3
// -----------------------------------------------------------------------------

describe('Property 13: Data persistence round trip', () => {
  let storage;
  withWindowScope();

  beforeEach(() => {
    storage = createMockStorage();
    global.window = { localStorage: storage };
  });

  // Clean alphabet generator: avoids unicode/surrogate edge cases entirely so
  // the round trip is trivially exact while still exercising varied content.
  const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.split('');
  const arbText = (minLen, maxLen) =>
    fc
      .array(fc.constantFrom(...ALPHA), { minLength: minLen, maxLength: maxLen })
      .map((chars) => chars.join(''));

  // Currency-precise amounts/budgets (cents / 100) so every value has at most
  // two decimal places and stays well within the documented bounds.
  const arbAmount = fc.integer({ min: 1, max: 100000000 }).map((c) => c / 100);
  const arbBudget = fc.integer({ min: 0, max: 100000000 }).map((c) => c / 100);

  const arbState = fc
    .record({
      txData: fc.array(
        fc.record({
          itemName: arbText(1, 50),
          amount: arbAmount,
          category: fc.constantFrom(...DEFAULT_CATEGORIES),
          createdAt: fc.integer({ min: 0, max: 2000000000000 }),
        }),
        { maxLength: 10 }
      ),
      monthlyBudget: arbBudget,
      customCategories: fc.uniqueArray(
        arbText(1, 20).filter((s) => !DEFAULT_CATEGORIES.includes(s)),
        { maxLength: 5, selector: (s) => s }
      ),
      sortState: fc.record({
        field: fc.constantFrom(null, 'amount', 'category'),
        direction: fc.constantFrom(null, 'asc', 'desc'),
      }),
    })
    .map(({ txData, ...rest }) => ({
      ...rest,
      transactions: txData.map((t, i) => ({ id: i + 1, ...t })),
    }));

  it('persisting a valid state then loading yields an equivalent state', () => {
    fc.assert(
      fc.property(arbState, (state) => {
        storage.clear();
        const persist = persistState(state);
        expect(persist.ok).toBe(true);
        const loaded = loadState();
        expect(loaded.error).toBeNull();
        expect(loaded.state).toEqual(state);
      }),
      { numRuns: 100 }
    );
  });
});
