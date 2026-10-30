// =============================================================================
// Expense & Budget Visualizer - js/app.js
// =============================================================================
// Single application file containing three layers:
//   1. Data Layer        - plain values + pure functions (no I/O, no DOM).
//   2. Persistence Layer - thin wrapper over the Local Storage API.
//   3. Presentation Layer- DOM controllers + bootstrap driven by a central
//                          dispatch function.
//
// The Data Layer is pure, which makes it the primary target for property-based
// testing (fast-check). This file is an ES module so its pure functions and
// constants can be imported directly by the test suite.
//
// Architecture (see design.md):
//   User Action -> Event Handler -> Data Layer (pure update) -> new State
//                   -> Persistence Layer (write) -> Presentation Layer (render)
// =============================================================================

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Default categories always available in the Category field. */
export const DEFAULT_CATEGORIES = ["Food", "Transport", "Fun"];

/** Performance guard: cap the number of transaction rows rendered into the DOM. */
export const MAX_TRANSACTIONS_RENDER = 1000;

/** Transaction amount bounds (inclusive of AMOUNT_MAX). */
export const AMOUNT_MIN = 0.01;
export const AMOUNT_MAX = 999999999.99;

/** Monthly budget bounds. */
export const BUDGET_MIN = 0.01;
export const BUDGET_MAX = 999999999.99;

/** Maximum trimmed length of a transaction Item Name. */
export const ITEM_NAME_MAX = 100;

/** Custom category name length bounds (trimmed). */
export const CUSTOM_CATEGORY_NAME_MIN = 1;
export const CUSTOM_CATEGORY_NAME_MAX = 50;

/** Maximum number of custom categories a user may add. */
export const CUSTOM_CATEGORY_MAX_COUNT = 100;

/** Expense-to-budget ratio at/above which the "approaching" warning shows. */
export const APPROACHING_LIMIT_RATIO = 0.80;

/** Single Local Storage key holding the serialized application state. */
export const STORAGE_KEY = 'expenseBudgetVisualizer.state.v1';

// -----------------------------------------------------------------------------
// State Model (Data Layer)
// -----------------------------------------------------------------------------
// All mutations go through pure reducer-style functions (added in later tasks)
// that return a NEW state value. State is never mutated in place by callers.
// -----------------------------------------------------------------------------

/**
 * A single expense record.
 *
 * @typedef {Object} Transaction
 * @property {number} id        - Unique within the state; monotonic integer
 *                                generated at creation time, used for delete.
 * @property {string} itemName  - Trimmed label, length 1..ITEM_NAME_MAX.
 * @property {number} amount    - Positive number, > 0 and <= AMOUNT_MAX.
 * @property {string} category  - One of the Default or Custom Categories.
 * @property {number} createdAt - Epoch milliseconds; used for most-recent-first
 *                                ordering and current-calendar-month filtering.
 */

/**
 * The current sort applied to the displayed transaction list.
 *
 * @typedef {Object} SortState
 * @property {null|string} field     - null | 'amount' | 'category'
 * @property {null|string} direction - null | 'asc' | 'desc'
 */

/**
 * Canonical application state. Held in memory; persisted to Local Storage on
 * every change.
 *
 * @typedef {Object} AppState
 * @property {Transaction[]} transactions  - Most-recently-added first.
 * @property {number} monthlyBudget         - >= 0; 0 means "not set".
 * @property {string[]} customCategories    - Excludes Default Categories.
 * @property {SortState} sortState          - Current sort applied to the list.
 */

/**
 * Canonical initial application state. Exported so tests can assert the shape
 * and so the storage layer can fall back to it on first run / corruption.
 *
 * NOTE: callers that need a fresh, independent copy should clone this value
 * (e.g. via structuredClone) rather than mutating it directly.
 *
 * @type {AppState}
 */
export const initialState = {
  transactions: [],
  monthlyBudget: 0,
  customCategories: [],
  sortState: { field: null, direction: null }
};

/**
 * Returns a fresh, deep copy of the initial state. Useful for tests and for
 * any code that needs an independent state value rather than a shared
 * reference to the exported `initialState` constant.
 *
 * @returns {AppState}
 */
export function createInitialState() {
  return structuredClone(initialState);
}


// -----------------------------------------------------------------------------
// Data Layer: Validation and Category Functions (Task 2.1)
// -----------------------------------------------------------------------------
// All functions below are pure: they take plain values and return new values
// without performing I/O or touching the DOM. They are the primary targets for
// property-based testing. Each returns either a validation result or a
// `{ state, error }` pair; on error the original state reference is returned
// unchanged so callers retain their prior valid state.
// -----------------------------------------------------------------------------

/**
 * Returns every category available for selection: the Default Categories first,
 * followed by the user's Custom Categories. Pure and non-mutating.
 *
 * @param {AppState} state - Current application state.
 * @returns {string[]} Defaults followed by customs, in insertion order.
 *
 * Validates: Requirements 1.2
 */
export function allCategories(state) {
  return [...DEFAULT_CATEGORIES, ...state.customCategories];
}

/**
 * Validates a transaction input, identifying the first invalid field.
 *
 * Rules (checked in order):
 *   - itemName: trimmed length must be 1..ITEM_NAME_MAX (100).
 *   - amount:   must be a finite number greater than AMOUNT_MIN and at most
 *               AMOUNT_MAX. A small floating-point tolerance is applied at the
 *               lower bound so the boundary value (0.01) is accepted reliably.
 *   - category: must be present in `allCategories(state)`.
 *
 * @param {*} itemName  - Raw item name (coerced to string, then trimmed).
 * @param {*} amount    - Raw amount (coerced via Number).
 * @param {*} category  - Category label to check.
 * @param {AppState} state - Current application state.
 * @returns {{ valid: boolean, field: null|string }} `field` is the first
 *   invalid field name ('itemName' | 'amount' | 'category') or null when valid.
 *
 * Validates: Requirements 1.4, 1.5
 */
export function validateTransaction(itemName, amount, category, state) {
  const trimmedName = String(itemName).trim();
  if (trimmedName.length === 0) return { valid: false, field: 'itemName' };
  if (trimmedName.length > ITEM_NAME_MAX) return { valid: false, field: 'itemName' };

  const amt = Number(amount);
 if (!Number.isFinite(amt) || amt <= AMOUNT_MIN - 0.000001 || amt > AMOUNT_MAX) {
    return { valid: false, field: 'amount' };
  }

  if (!allCategories(state).includes(category)) {
    return { valid: false, field: 'category' };
  }

  return { valid: true, field: null };
}

/**
 * Validates a monthly budget value.
 *
 * Rules:
 *   - Must be a finite number.
 *   - Must be between BUDGET_MIN (0.01) and BUDGET_MAX (999,999,999.99)
 *     inclusive.
 *   - Must have at most two decimal places (checked against the original
 *     string representation so values like "100.555" are rejected while
 *     numbers like 100 are accepted).
 *
 * @param {*} value - Raw budget value (coerced via Number; decimals inspected
 *   via its string form).
 * @returns {{ valid: boolean }}
 *
 * Validates: Requirements 3.1, 3.4
 */
export function validateBudget(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return { valid: false };
  if (v < BUDGET_MIN || v > BUDGET_MAX) return { valid: false };

  // At most 2 decimal places, inspected on the original string form so that
  // a value like "99.999" is rejected even though Number("99.999") is finite.
  const decimals = (String(value).split('.')[1] || '').length;
  if (decimals > 2) return { valid: false };

  return { valid: true };
}

/**
 * Validates a proposed custom category name against length, count, and
 * duplicate rules.
 *
 * Rules (checked in order):
 *   - length: trimmed name length must be 1..50.
 *   - limit:  fewer than CUSTOM_CATEGORY_MAX_COUNT (100) customs must exist.
 *   - duplicate: trimmed name must not equal a default or existing custom
 *     category (case-sensitive).
 *
 * @param {AppState} state - Current application state.
 * @param {*} name - Raw category name (coerced to string, then trimmed).
 * @returns {{ valid: boolean, reason: null|'length'|'limit'|'duplicate' }}
 *
 * Validates: Requirements 5.2, 5.4, 5.5
 */
export function validateCustomCategory(state, name) {
  const trimmed = String(name).trim();

  if (trimmed.length < CUSTOM_CATEGORY_NAME_MIN || trimmed.length > CUSTOM_CATEGORY_NAME_MAX) {
    return { valid: false, reason: 'length' };
  }

  if (state.customCategories.length >= CUSTOM_CATEGORY_MAX_COUNT) {
    return { valid: false, reason: 'limit' };
  }

  if (DEFAULT_CATEGORIES.includes(trimmed) || state.customCategories.includes(trimmed)) {
    return { valid: false, reason: 'duplicate' };
  }

  return { valid: true, reason: null };
}

/**
 * Sets the monthly budget, returning a new state on success.
 *
 * On an invalid value the original state reference is returned unchanged with
 * `error: true`, so callers retain their prior valid state and can surface a
 * validation message.
 *
 * @param {AppState} state - Current application state.
 * @param {*} value - Raw budget value.
 * @returns {{ state: AppState, error: boolean|null }}
 *
 * Validates: Requirements 3.1, 3.3, 3.4
 */
export function setBudget(state, value) {
  const v = validateBudget(value);
  if (!v.valid) return { state, error: true };
  return { state: { ...state, monthlyBudget: Number(value) }, error: null };
}

/**
 * Adds a custom category, returning a new state with the trimmed name appended
 * to `customCategories`.
 *
 * On an invalid name the original state reference is returned unchanged with
 * `error` set to the rejection reason, so callers retain their prior valid
 * state.
 *
 * @param {AppState} state - Current application state.
 * @param {*} name - Raw category name.
 * @returns {{ state: AppState, error: null|string }} `error` is the rejection
 *   reason ('length' | 'limit' | 'duplicate') or null on success.
 *
 * Validates: Requirements 5.2, 5.4, 5.5
 */
export function addCustomCategory(state, name) {
  const v = validateCustomCategory(state, name);
  if (!v.valid) return { state, error: v.reason };
  return {
    state: { ...state, customCategories: [...state.customCategories, String(name).trim()] },
    error: null
  };
}


// -----------------------------------------------------------------------------
// Data Layer: Transaction Operations (Task 4.1)
// -----------------------------------------------------------------------------
// Pure functions for creating, deleting, and sorting transactions. None of
// these perform I/O or touch the DOM; each returns a new state value (or, on
// validation failure, the original state reference) so callers retain their
// prior valid state. They are primary targets for property-based testing.
// -----------------------------------------------------------------------------

/**
 * Returns the next unique transaction id: the maximum existing id plus one,
 * or 1 when no transactions exist yet. Pure and non-mutating.
 *
 * @param {AppState} state - Current application state.
 * @returns {number} The next id to assign to a new transaction.
 *
 * Validates: Requirements 1.3
 */
export function nextId(state) {
  if (state.transactions.length === 0) return 1;
  return Math.max(...state.transactions.map(t => t.id)) + 1;
}

/**
 * Adds a transaction after validating the input, returning a new state with
 * the transaction prepended (most-recent-first) and the sort reset.
 *
 * On validation failure the original state reference is returned unchanged
 * with `error` set to the first invalid field name, so callers retain their
 * prior valid state and can surface a field-specific validation message.
 *
 * @param {AppState} state - Current application state.
 * @param {*} itemName - Raw item name (trimmed before storage).
 * @param {*} amount - Raw amount (coerced to a number before storage).
 * @param {*} category - Category label (must be a known category).
 * @returns {{ state: AppState, error: null|string }} `error` is the first
 *   invalid field name ('itemName' | 'amount' | 'category') or null on success.
 *
 * Validates: Requirements 1.3, 2.1
 */
export function addTransaction(state, itemName, amount, category) {
  const v = validateTransaction(itemName, amount, category, state);
  if (!v.valid) return { state, error: v.field };

  const tx = {
    id: nextId(state),
    itemName: String(itemName).trim(),
    amount: Number(amount),
    category: category,
    createdAt: Date.now()
  };

  return {
    state: {
      ...state,
      transactions: [tx, ...state.transactions],
      sortState: resetSort()
    },
    error: null
  };
}

/**
 * Deletes the transaction with the given id, returning a new state with that
 * transaction removed. If no transaction matches the id, a shallow copy is
 * returned with an equivalent (unchanged) transaction list.
 *
 * @param {AppState} state - Current application state.
 * @param {number} id - Id of the transaction to remove.
 * @returns {AppState} New state with the matching transaction filtered out.
 *
 * Validates: Requirements 2.2
 */
export function deleteTransaction(state, id) {
  return { ...state, transactions: state.transactions.filter(t => t.id !== id) };
}

/**
 * Applies a sort to the transaction list, toggling direction when the same
 * field is requested again. Ascending is the default on the first request of
 * a field.
 *
 * Sorting is performed on a copy of the transactions array so the result is a
 * stable permutation of the original: no transactions are added or lost. The
 * comparator is numeric for 'amount' and alphabetical (localeCompare) for
 * 'category'.
 *
 * @param {AppState} state - Current application state.
 * @param {'amount'|'category'} field - Field to sort by.
 * @returns {AppState} New state with sorted transactions and updated sortState.
 *
 * Validates: Requirements 2.3, 2.4, 12.3
 */
export function applySort(state, field) {
  let direction;
  if (state.sortState.field === field) {
    direction = state.sortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    direction = 'asc'; // ascending by default on first request of a field
  }

  const sorted = [...state.transactions].sort((a, b) => {
    let cmp;
    if (field === 'amount') {
      cmp = a.amount - b.amount;
    } else {
      cmp = a.category.localeCompare(b.category); // alphabetical by category
    }
    return direction === 'asc' ? cmp : -cmp;
  });

  return { ...state, transactions: sorted, sortState: { field, direction } };
}

/**
 * Resets the sort to unsorted (most-recent-first). Called when a transaction
 * is added so the list returns to reverse-chronological insertion order.
 *
 * @returns {SortState} A fresh sort state with null field and direction.
 *
 * Validates: Requirements 2.1
 */
export function resetSort() {
  return { field: null, direction: null };
}


// -----------------------------------------------------------------------------
// Data Layer: Derived Value Functions (Task 5.1)
// -----------------------------------------------------------------------------
// Pure functions that compute derived values from the current state (totals,
// remaining budget, warning classification, per-category aggregation, and
// current-month totals). None of these perform I/O or touch the DOM; each
// returns a plain value computed solely from its inputs. They are primary
// targets for property-based testing.
// -----------------------------------------------------------------------------

/**
 * Returns the sum of the amounts of all stored transactions. Pure.
 *
 * @param {AppState} state - Current application state.
 * @returns {number} The total expenses (0 when there are no transactions).
 *
 * Validates: Requirements 3.3, 4.1, 6.1, 6.2
 */
export function totalExpenses(state) {
  return state.transactions.reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Returns the remaining budget: the monthly budget minus the total expenses.
 * The result may be negative when expenses exceed the budget. Pure.
 *
 * @param {AppState} state - Current application state.
 * @returns {number} The remaining budget (may be negative).
 *
 * Validates: Requirements 3.3, 4.1, 4.2
 */
export function remainingBudget(state) {
  return state.monthlyBudget - totalExpenses(state);
}

/**
 * Classifies the warning state based on the expense-to-budget ratio.
 *
 * Returns:
 *   - `'no-budget'`  when the monthly budget is 0 or less (not set).
 *   - `'overspend'`  when total expenses exceed the budget (ratio > 1).
 *   - `'approaching'` when total expenses are at or above the
 *     APPROACHING_LIMIT_RATIO (80%) and at most 100% of the budget.
 *   - `'none'`       otherwise (spending below the approaching threshold).
 *
 * The ratio is `totalExpenses(state) / state.monthlyBudget`. The `overspend`
 * case (ratio > 1) is checked before the `approaching` case so that exactly
 * 100% of the budget is classified as `approaching`, not `overspend`. Pure.
 *
 * @param {AppState} state - Current application state.
 * @returns {'no-budget'|'overspend'|'approaching'|'none'} The warning state.
 *
 * Validates: Requirements 4.3, 4.4
 */
export function warningState(state) {
  if (state.monthlyBudget <= 0) return 'no-budget';
  const ratio = totalExpenses(state) / state.monthlyBudget;
  if (ratio > 1) return 'overspend';
  if (ratio >= APPROACHING_LIMIT_RATIO) return 'approaching';
  return 'none';
}

/**
 * Returns per-category totals for the spending distribution chart: a plain
 * object mapping each category name to the sum of the amounts of all
 * transactions in that category. Categories with no transactions are omitted
 * (no zero entries). Pure and non-mutating.
 *
 * @param {AppState} state - Current application state.
 * @returns {Record<string, number>} A map of category name to total amount.
 *
 * Validates: Requirements 6.1, 6.2
 */
export function categoryTotals(state) {
  const totals = {};
  for (const t of state.transactions) {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  }
  return totals;
}

/**
 * Returns the sum of transaction amounts whose `createdAt` timestamp falls
 * within the current calendar month, determined by `now` (which defaults to
 * `Date.now()`). A transaction is included when its month and year match those
 * of `now`. Pure.
 *
 * @param {AppState} state - Current application state.
 * @param {number} [now] - Reference epoch milliseconds; defaults to Date.now().
 * @returns {number} The total expenses for the current calendar month.
 *
 * Validates: Requirements 8.1, 8.2
 */
export function currentMonthTotalExpenses(state, now = Date.now()) {
  const d = new Date(now);
  const month = d.getMonth();
  const year = d.getFullYear();
  return state.transactions
    .filter(t => {
      const td = new Date(t.createdAt);
      return td.getMonth() === month && td.getFullYear() === year;
    })
    .reduce((sum, t) => sum + t.amount, 0);
}


// -----------------------------------------------------------------------------
// Storage Adapter (Persistence Layer) (Task 7.1)
// -----------------------------------------------------------------------------
// A thin wrapper over the Local Storage API. All application state is
// serialized to a single JSON blob under one key (STORAGE_KEY). This keeps
// reads/writes atomic at the application level and simplifies corruption
// recovery. The adapter detects failures explicitly and never throws: it
// returns structured results so callers can surface errors without losing
// in-memory state.
//
// Testability: the storage handle is resolved lazily via `getStorage()`, which
// returns `null` when `window`/`localStorage` is unavailable (e.g. in a Node.js
// test environment). The pure Data Layer does not depend on storage at all;
// these functions are exercised with an injected mock localStorage.
//
// Guiding principle: never lose in-memory data on a peripheral failure. The
// canonical state lives in memory; persistence and rendering are best-effort
// layers around it.
// -----------------------------------------------------------------------------

/**
 * Resolves the Local Storage handle safely. Returns `window.localStorage` when
 * available, or `null` when `window` is undefined (Node.js) or access throws
 * (e.g. some privacy modes). Never throws; pure with respect to app state.
 *
 * @returns {Storage|null}
 */
function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Reports whether Local Storage is available by performing a try/catch
 * set/remove cycle. Returns `false` when storage is unavailable or throws.
 * Never throws; never mutates application state.
 *
 * @returns {boolean}
 *
 * Validates: Requirements 9.6
 */
export function isStorageAvailable() {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const k = '__ebv_test__';
    storage.setItem(k, '1');
    storage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serializes the state to JSON and writes it to Local Storage under
 * STORAGE_KEY. Returns `{ ok: true, error: null }` on success, or
 * `{ ok: false, error: 'save_failed' }` on any exception (including quota
 * exceeded or unavailable storage). Never throws; never mutates the input
 * state.
 *
 * @param {AppState} state - State to persist.
 * @returns {{ ok: boolean, error: null|string }}
 *
 * Validates: Requirements 3.2, 5.3, 7.3, 7.6
 */
export function persistState(state) {
  const storage = getStorage();
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true, error: null };
  } catch {
    // QuotaExceededError, unavailable storage, or any other write failure.
    return { ok: false, error: 'save_failed' };
  }
}

/**
 * Reads and parses the stored JSON state. Returns:
 *   - `{ ok: true, state: <default>, error: null }` when no data exists (the
 *     stored value is null) or storage is unavailable — first run / no data.
 *   - `{ ok: true, state: <normalized>, error: null }` when stored data parses
 *     successfully (malformed entries are discarded by `normalizeLoadedState`).
 *   - `{ ok: true, state: <default>, error: 'load_corrupted' }` when the stored
 *     JSON cannot be parsed (the bad data is discarded and defaults are used).
 *
 * Never throws; never loses in-memory data on a peripheral failure.
 *
 * @returns {{ ok: boolean, state: AppState, error: null|string }}
 *
 * Validates: Requirements 3.2, 5.3, 7.2, 7.4, 7.5
 */
export function loadState() {
  const storage = getStorage();
  if (!storage) {
    // No storage available: treat as "no data" and return defaults.
    return { ok: true, state: createInitialState(), error: null };
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { ok: true, state: createInitialState(), error: null }; // first run, no data
    }
    const parsed = JSON.parse(raw);
    const normalized = normalizeLoadedState(parsed);
    return { ok: true, state: normalized, error: null };
  } catch {
    // JSON.parse threw, or reading threw -> corrupted/unrecoverable data.
    return { ok: true, state: createInitialState(), error: 'load_corrupted' };
  }
}

/**
 * Defensively coerces a parsed JSON blob into a well-formed application state,
 * discarding malformed entries (non-numeric amounts, missing required fields)
 * rather than throwing. Falls back to the initial state when the overall shape
 * is unrecoverable. Returns a fresh, independent state object.
 *
 * Coerced fields:
 *   - transactions: array; each entry is kept only if it has a finite numeric
 *     `id`, `amount`, and `createdAt` and string `itemName` and `category`;
 *     malformed entries are discarded.
 *   - monthlyBudget: finite non-negative number, else 0.
 *   - customCategories: array; only string entries are kept (in order).
 *   - sortState: object with a known `field` (null|'amount'|'category') and
 *     `direction` (null|'asc'|'desc'); invalid values reset to null.
 *
 * @param {*} parsed - The value returned by JSON.parse.
 * @returns {AppState} A well-formed, independent state.
 *
 * Validates: Requirements 7.2, 7.5
 */
export function normalizeLoadedState(parsed) {
  // Fall back to the initial state when the overall shape is unrecoverable.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return createInitialState();
  }

  // Transactions: keep only entries with a valid shape, discarding malformed
  // ones (non-numeric amounts, missing required fields).
  let transactions = [];
  if (Array.isArray(parsed.transactions)) {
    transactions = parsed.transactions
      .map(normalizeTransaction)
      .filter((t) => t !== null);
  }

  // Monthly budget: must be a finite, non-negative number; else default 0.
  let monthlyBudget = 0;
  if (
    typeof parsed.monthlyBudget === 'number' &&
    Number.isFinite(parsed.monthlyBudget) &&
    parsed.monthlyBudget >= 0
  ) {
    monthlyBudget = parsed.monthlyBudget;
  }

  // Custom categories: array of strings; keep only string entries in order.
  let customCategories = [];
  if (Array.isArray(parsed.customCategories)) {
    customCategories = parsed.customCategories.filter(
      (c) => typeof c === 'string'
    );
  }

  // Sort state: object with a known field and direction; else reset.
  let sortState = { field: null, direction: null };
  if (
    parsed.sortState &&
    typeof parsed.sortState === 'object' &&
    !Array.isArray(parsed.sortState)
  ) {
    const field = parsed.sortState.field;
    const direction = parsed.sortState.direction;
    sortState = {
      field: field === 'amount' || field === 'category' ? field : null,
      direction: direction === 'asc' || direction === 'desc' ? direction : null,
    };
  }

  return { transactions, monthlyBudget, customCategories, sortState };
}

/**
 * Coerces a single parsed transaction entry into a well-formed Transaction,
 * or returns `null` when the entry is malformed (non-object, or with a
 * non-numeric/missing `id`, `amount`, or `createdAt`, or non-string
 * `itemName`/`category`). Never throws.
 *
 * @param {*} t - A parsed transaction entry.
 * @returns {Transaction|null} A well-formed transaction, or null to discard.
 */
function normalizeTransaction(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return null;

  // Numeric fields must be finite numbers; non-numeric/missing -> discard.
  if (typeof t.id !== 'number' || !Number.isFinite(t.id)) return null;
  if (typeof t.amount !== 'number' || !Number.isFinite(t.amount)) return null;
  if (typeof t.createdAt !== 'number' || !Number.isFinite(t.createdAt))
    return null;

  // itemName and category must be strings.
  if (typeof t.itemName !== 'string') return null;
  if (typeof t.category !== 'string') return null;

  return {
    id: t.id,
    itemName: t.itemName,
    amount: t.amount,
    category: t.category,
    createdAt: t.createdAt,
  };
}



// =============================================================================
// PRESENTATION LAYER
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Application Initialization
// -----------------------------------------------------------------------------

let state = loadState().state;
let spendingChart = null;

const transactionForm = document.getElementById('transaction-form');
const itemNameInput = document.getElementById('item-name');
const amountInput = document.getElementById('amount');
const categoryInput = document.getElementById('category');

const budgetInput = document.getElementById('budget-input');
const budgetMessage = document.getElementById('budget-message');
const remainingBudgetDisplay = document.getElementById('remaining-budget');
const warningBanner = document.getElementById('warning-banner');

const transactionList = document.getElementById('transaction-list');

const customCategoryForm = document.getElementById('custom-category-form');
const customCategoryInput = document.getElementById('custom-category-input');

const monthlySummary = document.getElementById('monthly-summary');

const errorArea = document.getElementById('error-area');

const chartEmptyMessage = document.getElementById('chart-empty-message');
const chartErrorMessage = document.getElementById('chart-error-message');


// -----------------------------------------------------------------------------
// 2. Helper Functions
// -----------------------------------------------------------------------------

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

function showError(message) {
  errorArea.textContent = message;
}

function clearError() {
  errorArea.textContent = '';
}

function saveApplicationState() {
  const result = persistState(state);

  if (!result.ok) {
    showError('Unable to save data. Your changes may not persist after refreshing.');
  } else {
    clearError();
  }
}

function clearValidationMessages() {
  document.getElementById('item-name-error').textContent = '';
  document.getElementById('amount-error').textContent = '';
  document.getElementById('category-error').textContent = '';
}

function showFieldError(field, message) {
  const errorElement = document.getElementById(`${field}-error`);

  if (errorElement) {
    errorElement.textContent = message;
  }
}


// -----------------------------------------------------------------------------
// 3. Category Dropdown
// -----------------------------------------------------------------------------

function renderCategories() {
  const selectedCategory = categoryInput.value;

  categoryInput.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a Category';

  categoryInput.appendChild(placeholder);

  allCategories(state).forEach(category => {
    const option = document.createElement('option');

    option.value = category;
    option.textContent = category;

    categoryInput.appendChild(option);
  });

  if (allCategories(state).includes(selectedCategory)) {
    categoryInput.value = selectedCategory;
  }
}


// -----------------------------------------------------------------------------
// 4. Transaction List
// -----------------------------------------------------------------------------

function renderTransactions() {
  transactionList.innerHTML = '';

  if (state.transactions.length === 0) {
    const emptyMessage = document.createElement('p');

    emptyMessage.textContent = 'No transactions yet.';

    transactionList.appendChild(emptyMessage);
    return;
  }

  const transactionsToRender = state.transactions.slice(
    0,
    MAX_TRANSACTIONS_RENDER
  );

  transactionsToRender.forEach(transaction => {
    const row = document.createElement('div');

    row.setAttribute('role', 'listitem');
    row.className = 'transaction-row';

    const details = document.createElement('span');

    details.textContent =
      `${transaction.itemName} - ${formatCurrency(transaction.amount)} - ${transaction.category}`;

    const deleteButton = document.createElement('button');

    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.setAttribute('aria-label', `Delete ${transaction.itemName}`);

    deleteButton.addEventListener('click', () => {
      state = deleteTransaction(state, transaction.id);

      saveApplicationState();
      renderApplication();
    });

    row.appendChild(details);
    row.appendChild(deleteButton);

    transactionList.appendChild(row);
  });

  if (state.transactions.length > MAX_TRANSACTIONS_RENDER) {
    const notice = document.createElement('p');

    notice.textContent =
      `Showing the first ${MAX_TRANSACTIONS_RENDER} transactions.`;

    transactionList.appendChild(notice);
  }
}


// -----------------------------------------------------------------------------
// 5. Monthly Budget and Remaining Budget
// -----------------------------------------------------------------------------

function renderBudget() {
  const remaining = remainingBudget(state);

  remainingBudgetDisplay.textContent = formatCurrency(remaining);

  if (state.monthlyBudget > 0) {
    budgetInput.value = state.monthlyBudget;
  } else {
    budgetInput.value = '';
  }

  const warning = warningState(state);

  warningBanner.textContent = '';

  if (warning === 'no-budget') {
    warningBanner.textContent = 'Please set your monthly budget.';
  }

  if (warning === 'approaching') {
    warningBanner.textContent =
      'Warning: You have used at least 80% of your monthly budget.';
  }

  if (warning === 'overspend') {
    warningBanner.textContent =
      'Warning: You have exceeded your monthly budget!';
  }
}


// -----------------------------------------------------------------------------
// 6. Monthly Summary
// -----------------------------------------------------------------------------

function renderMonthlySummary() {
  monthlySummary.innerHTML = '';

  if (state.monthlyBudget <= 0) {
    monthlySummary.textContent =
      'Please set a monthly budget to view your monthly summary.';
    return;
  }

  const monthlyTotal = currentMonthTotalExpenses(state);
  const remaining = state.monthlyBudget - monthlyTotal;

  const totalElement = document.createElement('p');
  totalElement.textContent =
    `Total spent this month: ${formatCurrency(monthlyTotal)}`;

  const remainingElement = document.createElement('p');
  remainingElement.textContent =
    `Remaining monthly budget: ${formatCurrency(remaining)}`;

  monthlySummary.appendChild(totalElement);
  monthlySummary.appendChild(remainingElement);
}


// -----------------------------------------------------------------------------
// 7. Spending Distribution Pie Chart
// -----------------------------------------------------------------------------

function renderChart() {
  const totals = categoryTotals(state);

  const categories = Object.keys(totals);
  const amounts = Object.values(totals);

  chartErrorMessage.hidden = true;
  chartEmptyMessage.hidden = categories.length > 0;

  if (categories.length === 0) {
    if (spendingChart) {
      spendingChart.destroy();
      spendingChart = null;
    }

    return;
  }

  const canvas = document.getElementById('pie-chart');

  if (
    window.chartJsLoadFailed ||
    typeof Chart === 'undefined'
  ) {
    if (spendingChart) {
      spendingChart.destroy();
      spendingChart = null;
    }

    chartErrorMessage.hidden = false;
    chartErrorMessage.textContent =
      'Unable to load the chart. Please check your internet connection.';

    return;
  }

  if (spendingChart) {
    spendingChart.destroy();
  }

  spendingChart = new Chart(canvas, {
    type: 'pie',

    data: {
      labels: categories,

      datasets: [{
        data: amounts,

        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40'
        ],

        borderWidth: 1
      }]
    },

    options: {
      responsive: true,

      plugins: {
        legend: {
          position: 'bottom'
        },

        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.label}: ${formatCurrency(context.raw)}`;
            }
          }
        }
      }
    }
  });
}


// -----------------------------------------------------------------------------
// 8. Main Render Function
// -----------------------------------------------------------------------------

function renderApplication() {
  renderCategories();
  renderTransactions();
  renderBudget();
  renderMonthlySummary();
  renderChart();
}


// -----------------------------------------------------------------------------
// 9. Add Transaction Event Listener
// -----------------------------------------------------------------------------

transactionForm.addEventListener('submit', (event) => {
  event.preventDefault();

  clearValidationMessages();
  clearError();

  const itemName = itemNameInput.value;
  const amount = amountInput.value;
  const category = categoryInput.value;

  const result = addTransaction(
    state,
    itemName,
    amount,
    category
  );

  if (result.error) {
    const messages = {
      itemName: 'Please enter an item name (maximum 100 characters).',
      amount: 'Amount must be a whole number between 1 and 99.',
      category: 'Please select a valid category.'
    };

    showFieldError(result.error, messages[result.error]);
    return;
  }

  state = result.state;

  saveApplicationState();

  transactionForm.reset();

  renderApplication();
});


// -----------------------------------------------------------------------------
// 10. Monthly Budget Event Listener
// -----------------------------------------------------------------------------

budgetInput.addEventListener('change', () => {
  budgetMessage.textContent = '';

  if (budgetInput.value.trim() === '') {
    budgetMessage.textContent = 'Please enter a monthly budget.';
    return;
  }

  const result = setBudget(state, budgetInput.value);

  if (result.error) {
    budgetMessage.textContent =
      'Please enter a valid budget between $0.01 and $999,999,999.99 with at most two decimal places.';
    return;
  }

  state = result.state;

  saveApplicationState();

  renderApplication();

  budgetMessage.textContent = 'Monthly budget updated.';
});


// -----------------------------------------------------------------------------
// 11. Custom Category Event Listener
// -----------------------------------------------------------------------------

customCategoryForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const errorElement =
    document.getElementById('custom-category-error');

  errorElement.textContent = '';

  const result = addCustomCategory(
    state,
    customCategoryInput.value
  );

  if (result.error) {
    const messages = {
      length: 'Category name must contain 1 to 50 characters.',
      limit: 'You have reached the maximum number of custom categories.',
      duplicate: 'This category already exists.'
    };

    errorElement.textContent = messages[result.error];
    return;
  }

  state = result.state;

  saveApplicationState();

  customCategoryForm.reset();

  renderApplication();
});


// -----------------------------------------------------------------------------
// 12. Sorting Event Listeners
// -----------------------------------------------------------------------------

document.getElementById('sort-amount').addEventListener('click', () => {
  state = applySort(state, 'amount');

  saveApplicationState();
  renderTransactions();
});

document.getElementById('sort-category').addEventListener('click', () => {
  state = applySort(state, 'category');

  saveApplicationState();
  renderTransactions();
});


// -----------------------------------------------------------------------------
// 13. Application Startup
// -----------------------------------------------------------------------------

renderApplication();

// Check Local Storage availability
if (!isStorageAvailable()) {
  showError(
    'Local Storage is unavailable. Your data may not be saved after refreshing.'
  );
}
