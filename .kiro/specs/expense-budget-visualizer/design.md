# Design Document

## Overview

This document describes the architecture, components, interfaces, data models, and error handling for the Expense & Budget Visualizer. The application is a standalone, backend-free single-page web app built with HTML, CSS, and Vanilla JavaScript. All state lives in the browser and is persisted through the Local Storage API. The only external runtime dependency is Chart.js, loaded from a Content Delivery Network for the spending distribution pie chart.

The design prioritizes a clean separation between data logic (a pure, framework-free module operating on plain values), persistence (a thin Local Storage wrapper), and presentation (DOM rendering driven by state). This separation keeps the data logic independently testable as pure functions and keeps the UI layer thin.

## Architecture

### High-Level Architecture

The application follows a unidirectional data-flow architecture with three layers:

1. **Data Layer** (`js/app.js` core logic) — Plain JavaScript values and pure functions that own the canonical state. This layer has no DOM or storage dependencies and is the target of property-based testing.
2. **Persistence Layer** (Storage adapter) — A thin wrapper over the `window.localStorage` API responsible for serializing and deserializing state to/from a single storage key, with explicit failure detection.
3. **Presentation Layer** (DOM controllers) — Functions that read state, render it into the DOM, and attach event handlers. User actions dispatch intent into the Data Layer, which produces new state; the Presentation Layer then re-renders the affected regions.

The flow is strictly one-directional:

```
User Action -> Event Handler -> Data Layer (pure update) -> new State
                -> Persistence Layer (write) -> Presentation Layer (render)
```

There is no bidirectional binding. Each user action produces a new immutable-ish state snapshot, persists it, and triggers a targeted re-render of the affected UI regions (Transaction List, Remaining Budget, warnings, Pie Chart, Monthly Summary).

### File Structure

```
/
  index.html        # Single HTML document, all UI regions declared here
  css/
    styles.css      # Single stylesheet, light theme only
  js/
    app.js          # Single JavaScript file: data layer, storage adapter, DOM controllers, bootstrap
```

Exactly one HTML file at the project root, exactly one CSS file in `css/`, exactly one JavaScript file in `js/`. No build step, no bundler, no frontend framework.

### Runtime Dependencies

- **Chart.js**: loaded from a CDN via a `<script>` tag in `index.html`. The application degrades gracefully if the script fails (see Error Handling). Chart.js is treated strictly as a rendering library; no application state lives inside Chart.js objects. The application keeps its own category-total data model and feeds Chart.js a snapshot each render, so a Chart.js failure never corrupts application state.

## Components and Interfaces

### 1. State Model (Data Layer)

The central state object. All mutations go through pure reducer-style functions that return a new state value. The state is never mutated in place by callers.

```javascript
// Canonical application state. Held in memory; persisted to localStorage on every change.
const initialState = {
  transactions: [],      // Array<Transaction>, most-recently-added first
  monthlyBudget: 0,      // number >= 0, 0 means "not set"
  customCategories: [],  // Array<string>, excludes Default Categories
  sortState: {           // current sort applied to the displayed list
    field: null,         // null | 'amount' | 'category'
    direction: null      // null | 'asc' | 'desc'
  }
};
```

**Transaction shape:**

```javascript
// A single expense record. `id` is a monotonically increasing integer
// generated at creation time and used as a stable identity for delete.
// `createdAt` is an epoch-millis timestamp used for most-recent-first ordering
// and for current-calendar-month filtering.
const Transaction = {
  id: 0,            // number, unique within the state
  itemName: "",     // string, 1..100 chars (trimmed)
  amount: 0,        // number, > 0 and <= 999999999.99
  category: "",     // string, one of Default or Custom Categories
  createdAt: 0      // number, epoch milliseconds
};
```

**Constants:**

```javascript
const DEFAULT_CATEGORIES = ["Food", "Transport", "Fun"];
const MAX_TRANSACTIONS_RENDER = 1000;        // performance guard for the list view
const AMOUNT_MIN = 0.01;
const AMOUNT_MAX = 999999999.99;
const BUDGET_MIN = 0.01;
const BUDGET_MAX = 999999999.99;
const ITEM_NAME_MAX = 100;
const CUSTOM_CATEGORY_NAME_MIN = 1;
const CUSTOM_CATEGORY_NAME_MAX = 50;
const CUSTOM_CATEGORY_MAX_COUNT = 100;
const APPROACHING_LIMIT_RATIO = 0.80;        // 80% threshold
```

### 2. Pure Data Functions

These functions take state (and inputs) and return either a new state or a validation result. They perform no I/O and no DOM access, which makes them the primary targets for property-based testing.

```javascript
// Returns all categories available for selection: defaults first, then customs.
function allCategories(state) {
  return [...DEFAULT_CATEGORIES, ...state.customCategories];
}

// Sum of all transaction amounts. Pure.
function totalExpenses(state) {
  return state.transactions.reduce((sum, t) => sum + t.amount, 0);
}

// Monthly budget minus total expenses. May be negative.
function remainingBudget(state) {
  return state.monthlyBudget - totalExpenses(state);
}

// Classifies the warning state based on the expense-to-budget ratio.
// Returns: 'none' | 'approaching' | 'overspend' | 'no-budget'
function warningState(state) {
  if (state.monthlyBudget <= 0) return 'no-budget';
  const ratio = totalExpenses(state) / state.monthlyBudget;
  if (ratio > 1) return 'overspend';
  if (ratio >= APPROACHING_LIMIT_RATIO) return 'approaching';
  return 'none';
}

// Per-category totals for the pie chart. Returns a map of category -> total.
function categoryTotals(state) {
  const totals = {};
  for (const t of state.transactions) {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  }
  return totals;
}

// Sum of transaction amounts whose createdAt falls in the current calendar month.
function currentMonthTotalExpenses(state, now = Date.now()) {
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

// Validates transaction input. Returns { valid: boolean, field: string|null }.
function validateTransaction(itemName, amount, category, state) {
  const trimmedName = String(itemName).trim();
  if (trimmedName.length === 0) return { valid: false, field: 'itemName' };
  if (trimmedName.length > ITEM_NAME_MAX) return { valid: false, field: 'itemName' };
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= AMOUNT_MIN - 0.000001 || amt > AMOUNT_MAX) {
    return { valid: false, field: 'amount' };
  }
  if (!allCategories(state).includes(category)) return { valid: false, field: 'category' };
  return { valid: true, field: null };
}

// Adds a valid transaction, returning a new state with the transaction prepended.
function addTransaction(state, itemName, amount, category) {
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
    state: { ...state, transactions: [tx, ...state.transactions], sortState: resetSort() },
    error: null
  };
}

// Deletes a transaction by id, returning a new state.
function deleteTransaction(state, id) {
  return { ...state, transactions: state.transactions.filter(t => t.id !== id) };
}

// Validates a monthly budget value. Returns { valid: boolean }.
function validateBudget(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return { valid: false };
  if (v < BUDGET_MIN || v > BUDGET_MAX) return { valid: false };
  // At most 2 decimal places
  const decimals = (String(value).split('.')[1] || '').length;
  if (decimals > 2) return { valid: false };
  return { valid: true };
}

// Sets the monthly budget, returning a new state.
function setBudget(state, value) {
  const v = validateBudget(value);
  if (!v.valid) return { state, error: true };
  return { state: { ...state, monthlyBudget: Number(value) }, error: null };
}

// Validates a custom category name against length, count, and duplicate rules.
function validateCustomCategory(state, name) {
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

// Adds a custom category, returning a new state.
function addCustomCategory(state, name) {
  const v = validateCustomCategory(state, name);
  if (!v.valid) return { state, error: v.reason };
  return {
    state: { ...state, customCategories: [...state.customCategories, String(name).trim()] },
    error: null
  };
}

// Sorts the transaction list by field, toggling direction on re-request.
function applySort(state, field) {
  let direction;
  if (state.sortState.field === field) {
    direction = state.sortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    direction = 'asc'; // ascending by default on first request of a field
  }
  const sorted = [...state.transactions].sort((a, b) => {
    let cmp;
    if (field === 'amount') cmp = a.amount - b.amount;
    else cmp = a.category.localeCompare(b.category); // alphabetical by category
    return direction === 'asc' ? cmp : -cmp;
  });
  return { ...state, transactions: sorted, sortState: { field, direction } };
}

// Resets sort to unsorted (most-recent-first). Called when a transaction is added.
function resetSort() {
  return { field: null, direction: null };
}
```

### 3. Storage Adapter (Persistence Layer)

A thin module wrapping `window.localStorage` with explicit error handling. All application state is serialized to a single JSON blob under one key. This keeps reads/writes atomic at the application level and simplifies corruption recovery.

```javascript
const STORAGE_KEY = 'expenseBudgetVisualizer.state.v1';

function isStorageAvailable() {
  try {
    const k = '__ebv_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

// Serialize + write. Returns { ok: boolean, error: string|null }.
function persistState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true, error: null };
  } catch (e) {
    // QuotaExceededError or any other write failure
    return { ok: false, error: 'save_failed' };
  }
}

// Read + deserialize. Returns { ok, state, error }.
// On corruption, discards bad data and returns defaults.
function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { ok: true, state: initialState, error: null }; // first run, no data
    }
    const parsed = JSON.parse(raw);
    // Validate the parsed shape; if invalid, fall back to defaults.
    const normalized = normalizeLoadedState(parsed);
    return { ok: true, state: normalized, error: null };
  } catch (e) {
    // JSON.parse threw -> corrupted data
    return { ok: true, state: initialState, error: 'load_corrupted' };
  }
}
```

`normalizeLoadedState` defensively coerces a parsed blob into a well-formed state, discarding malformed entries (e.g., transactions with non-numeric amounts) rather than throwing. If the overall shape is unrecoverable, the caller falls back to `initialState`.

### 4. DOM Controllers (Presentation Layer)

Each controller owns a region of the DOM and exposes a `render(state)` method plus event wiring. Controllers never mutate state directly; they call a central `dispatch` function that runs a Data Layer function, persists the result, and re-renders.

```javascript
// Central dispatch: run an update, persist, then re-render all regions.
function dispatch(updateFn, ...args) {
  const result = updateFn(currentState, ...args);
  if (result.error) {
    showError(result.error);   // surface validation/storage error to the user
    return;
  }
  currentState = result.state;
  const persist = persistState(currentState);
  if (!persist.ok) {
    showError(persist.error);   // retain in-memory state, show error
  }
  renderAll(currentState);
}
```

**Regions:**

- **InputFormController**: owns the Item Name, Amount, and Category fields plus the add button. On submit, calls `dispatch(addTransaction, ...)`. Also manages the custom category add control. Repopulates the Category `<select>` from `allCategories(state)` on every render.
- **TransactionListController**: renders the scrollable list. Shows most-recent-first by default; honors `sortState`. Renders the empty-state message when `transactions` is empty. Wires delete buttons and sort buttons.
- **BudgetController**: owns the budget input. On change, calls `dispatch(setBudget, ...)`. Displays validation messages.
- **SummaryController**: renders the Remaining Budget at the top, the warning banner (approaching/overspend/no-budget), and the Monthly Summary View (current-month total + remaining, or the "must set a budget" message).
- **ChartController**: renders the Chart.js pie chart from `categoryTotals(state)`. If Chart.js is unavailable, shows an error message in the chart area and leaves all other functionality intact. On empty transactions, shows the empty-state chart message.

### 5. Bootstrap

On `DOMContentLoaded`:

1. Check `isStorageAvailable()`. If unavailable, set a global flag and show an error banner; the app continues with in-memory state only.
2. `loadState()` to get the initial state (or defaults if empty/corrupted). If `loadState` returns a `load_corrupted` error, show an error message.
3. Load Chart.js. If the CDN `<script>` fails (detected via an `onerror` handler or a load-timeout check), show the chart-area error message.
4. Wire all controllers' event handlers.
5. `renderAll(state)` for the first paint.

### Internal Function Contracts

| Function | Input | Output | Side Effects |
|---|---|---|---|
| `validateTransaction` | itemName, amount, category, state | `{ valid, field }` | none (pure) |
| `addTransaction` | state, itemName, amount, category | `{ state, error }` | none (pure) |
| `deleteTransaction` | state, id | new state | none (pure) |
| `validateBudget` | value | `{ valid }` | none (pure) |
| `setBudget` | state, value | `{ state, error }` | none (pure) |
| `validateCustomCategory` | state, name | `{ valid, reason }` | none (pure) |
| `addCustomCategory` | state, name | `{ state, error }` | none (pure) |
| `applySort` | state, field | new state | none (pure) |
| `totalExpenses` | state | number | none (pure) |
| `remainingBudget` | state | number | none (pure) |
| `warningState` | state | `'none'\|'approaching'\|'overspend'\|'no-budget'` | none (pure) |
| `categoryTotals` | state | `Record<string, number>` | none (pure) |
| `currentMonthTotalExpenses` | state, now? | number | none (pure) |
| `allCategories` | state | `string[]` | none (pure) |
| `persistState` | state | `{ ok, error }` | writes localStorage |
| `loadState` | none | `{ ok, state, error }` | reads localStorage |
| `dispatch` | updateFn, ...args | none | mutates `currentState`, persists, renders |

### External Boundary

- **Local Storage API**: single key, JSON string. Schema documented in the State Model. Unknown fields are ignored on load; malformed fields are discarded.
- **Chart.js API**: only `new Chart(ctx, config)` and `chart.update()` / `chart.destroy()` are used. The application owns the data; Chart.js only receives snapshots.
- **DOM**: a fixed set of element IDs declared in `index.html`.

## Data Models

### State (persisted)

```json
{
  "transactions": [
    { "id": 1, "itemName": "Lunch", "amount": 12.50, "category": "Food", "createdAt": 1730000000000 }
  ],
  "monthlyBudget": 500,
  "customCategories": ["Books"],
  "sortState": { "field": "amount", "direction": "asc" }
}
```

### Derived Values (computed, not persisted)

- `totalExpenses` = sum of `transaction.amount`
- `remainingBudget` = `monthlyBudget - totalExpenses`
- `warningState` = function of `totalExpenses / monthlyBudget`
- `categoryTotals` = per-category sums
- `currentMonthTotalExpenses` = sum of amounts where `createdAt` is in the current calendar month

### Validation Rules Summary

| Field | Rule |
|---|---|
| itemName | trimmed length 1..100 |
| amount | finite number, > 0, <= 999,999,999.99 |
| category | must be in `allCategories(state)` |
| monthlyBudget | finite number, >= 0.01, <= 999,999,999.99, <= 2 decimal places |
| customCategory name | trimmed length 1..50 |
| customCategory count | existing customs < 100 |
| customCategory uniqueness | not equal to any default or existing custom (case-sensitive) |

## Error Handling

The application distinguishes three categories of failure and handles each without crashing:

1. **Validation errors** (user input): the Data Layer returns an `error` from the validate/add functions. `dispatch` surfaces a field-specific validation message and does not mutate state or persist. The interface retains its prior valid state.

2. **Local Storage unavailability / write failure** (quota exceeded, disabled storage): `isStorageAvailable()` is checked at bootstrap. `persistState` catches all write exceptions and returns `{ ok: false }`. On failure, the in-memory state is retained, the prior interface data is preserved, and an error message is shown. Reads (`loadState`) that throw fall back to defaults with an error message; corrupted JSON is discarded and defaults are used.

3. **Chart.js / CDN failure** (no internet, blocked CDN): detected at load time. The chart area shows an error message; all other functionality (transactions, budget, categories, summary) continues to operate on the application's own data model, which does not depend on Chart.js.

In all cases, the guiding principle is: **never lose in-memory data on a peripheral failure**. The canonical state lives in memory; persistence and rendering are best-effort layers around it.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Transaction input validation

*For any* transaction input, the validation function SHALL accept the input if and only if the trimmed item name has length between 1 and 100, the amount is a finite number greater than 0 and at most 999,999,999.99, and the category is a known category; otherwise it SHALL reject the input and identify the first invalid field.

**Validates: Requirements 1.4, 1.5**

### Property 2: Valid transaction addition

*For any* current state and any input that passes transaction validation, adding the transaction SHALL prepend it to the transaction list, increase the list length by exactly one, and reset the sort to most-recent-first, leaving all other transactions unchanged.

**Validates: Requirements 1.3**

### Property 3: Category field prepopulation

*For any* set of stored custom categories, the category field SHALL contain exactly the Default Categories (Food, Transport, Fun) followed by the custom categories, with no duplicates and no omissions.

**Validates: Requirements 1.2**

### Property 4: Most-recent-first ordering before sort

*For any* sequence of added transactions, before any explicit sort is applied, the transaction list SHALL be ordered so that the most recently added transaction appears first (reverse-chronological insertion order).

**Validates: Requirements 2.1**

### Property 5: Transaction deletion removes from list and storage

*For any* state and any transaction id present in the state, deleting that transaction SHALL remove exactly that transaction from the list (length decreases by one) and the remaining transactions SHALL be unchanged, and the persisted storage SHALL no longer contain the deleted transaction.

**Validates: Requirements 2.2**

### Property 6: Sort by amount with toggle

*For any* transaction list, requesting a sort by amount SHALL order the list in ascending amount order by default, and re-requesting the same sort SHALL toggle to descending order, with each result being a stable permutation of the original transactions (no transactions added or lost).

**Validates: Requirements 2.3**

### Property 7: Sort by category with toggle

*For any* transaction list, requesting a sort by category SHALL order the list alphabetically by category in ascending order by default, and re-requesting the same sort SHALL toggle to descending order, with each result being a stable permutation of the original transactions (no transactions added or lost).

**Validates: Requirements 2.4**

### Property 8: Monthly budget validation

*For any* budget value, the validation function SHALL accept the value if and only if it is a finite number between 0.01 and 999,999,999.99 inclusive with at most two decimal places; otherwise it SHALL reject the value.

**Validates: Requirements 3.1, 3.4**

### Property 9: Remaining budget invariant

*For any* state, the displayed remaining budget SHALL equal the monthly budget minus the sum of all transaction amounts, and this invariant SHALL hold immediately after setting the budget and after adding or deleting any transaction.

**Validates: Requirements 3.3, 4.1, 4.2**

### Property 10: Budget warning state by expense ratio

*For any* monthly budget greater than zero, the warning state SHALL be `none` when total expenses are below 80% of the budget, `approaching` when total expenses are at or above 80% and at most 100% of the budget, and `overspend` with a negative remaining budget when total expenses exceed the budget.

**Validates: Requirements 4.3, 4.4**

### Property 11: Custom category validation

*For any* state and any proposed custom category name, the addition SHALL succeed if and only if the trimmed name has length between 1 and 50, fewer than 100 custom categories already exist, and the trimmed name does not equal any default category or existing custom category; otherwise the addition SHALL be rejected, the custom category list SHALL be unchanged, and the rejection reason SHALL be identifiable.

**Validates: Requirements 5.2, 5.4, 5.5**

### Property 12: Spending distribution aggregation

*For any* set of transactions, each category total SHALL equal the sum of the amounts of all transactions in that category, and the sum of all category totals SHALL equal the total expenses; after adding or deleting any transaction, the recomputed category totals SHALL reflect the current transactions exactly.

**Validates: Requirements 6.1, 6.2**

### Property 13: Data persistence round trip

*For any* valid state consisting of transactions, a monthly budget, and custom categories, serializing the state to local storage and then deserializing it SHALL produce an equivalent state (equal transactions, equal budget, equal custom categories, equal sort state), and this SHALL hold after each mutation (add, delete, budget change, category change).

**Validates: Requirements 3.2, 5.3, 7.1, 7.2, 7.3**

### Property 14: Monthly summary total reflects current month

*For any* set of transactions, the monthly summary total expenses SHALL equal the sum of the amounts of all transactions whose timestamp falls within the current calendar month, and after adding or deleting any transaction the recomputed monthly summary SHALL reflect the current transactions exactly.

**Validates: Requirements 8.1, 8.2**

## Testing Strategy

**Dual Testing Approach:**

- **Property-based tests** validate the pure Data Layer functions (Properties 1–14) across randomized inputs using a property-based testing library (e.g., fast-check for JavaScript) with a minimum of 100 iterations per property. Generators produce random transactions, budgets, category names, and sort requests within and across valid/invalid boundaries. The Data Layer is pure, so tests run in-memory with no DOM or storage.
- **Unit tests** cover specific examples and edge cases: empty-name rejection, exactly-100-character name acceptance, amount boundary values (0.01 and 999,999,999.99), the 80% threshold boundary, the 100-custom-category limit, duplicate category rejection, and corrupted-storage fallback.
- **Edge-case tests** simulate failures by injecting a mock storage adapter that throws on write (quota exceeded), returns `null`/corrupt JSON on read, and reports unavailable; and by simulating Chart.js load failure. These verify the retain-in-memory-and-show-error behavior.
- **Integration / smoke tests** verify the wiring that is not suitable for PBT: the Input Form contains the required fields, the file structure is exactly one HTML/CSS/JS file, Chart.js loads from a CDN, the light-theme contrast and typography constraints hold, default initialization on empty storage, the empty-state messages, the "must set a budget" message, and the performance budgets (initial render within 2s; add/delete and sort within 100ms at 1,000 transactions).

**Property Test Configuration:**

- Minimum 100 iterations per property test.
- Each property test references its design document property.
- Tag format: **Feature: expense-budget-visualizer, Property {number}: {property_text}**
