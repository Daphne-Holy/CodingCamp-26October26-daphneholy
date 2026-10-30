# Implementation Plan: Expense & Budget Visualizer

## Overview

The implementation follows a unidirectional data-flow architecture with three layers: a pure Data Layer of functions operating on plain state values, a thin Persistence Layer wrapping the Local Storage API, and a Presentation Layer of DOM controllers driven by a central dispatch function. The app is built with HTML, CSS, and Vanilla JavaScript in exactly one file per type, with Chart.js loaded from a CDN. Property-based tests (fast-check) validate the 14 pure Data Layer properties; unit tests cover storage edge cases; integration tests verify wiring and DOM structure.

## Tasks

- [x] 1. Set up project structure and test framework
  - [x] 1.1 Create project files, constants, and initial state model
    - Create `index.html` at the project root with UI region containers: input form (item name, amount, category select, add button, custom category input), budget input, remaining budget display, warning banner area, scrollable transaction list container, sort buttons, chart canvas container, monthly summary section, and error message containers
    - Include the Chart.js CDN `<script>` tag with an `onerror` hook for failure detection
    - Create `css/styles.css` with initial light theme skeleton (light background, readable fonts)
    - Create `js/app.js` with all constants (`DEFAULT_CATEGORIES`, `MAX_TRANSACTIONS_RENDER`, `AMOUNT_MIN`, `AMOUNT_MAX`, `BUDGET_MIN`, `BUDGET_MAX`, `ITEM_NAME_MAX`, `CUSTOM_CATEGORY_NAME_MIN`, `CUSTOM_CATEGORY_NAME_MAX`, `CUSTOM_CATEGORY_MAX_COUNT`, `APPROACHING_LIMIT_RATIO`, `STORAGE_KEY`) and the `initialState` object (`transactions`, `monthlyBudget`, `customCategories`, `sortState`)
    - Define the `Transaction` shape and `sortState` shape as documented in the design
    - Export pure functions for testability (ES module exports or global namespace pattern)
    - Create `package.json` with `fast-check` and a test runner (e.g., Vitest) as devDependencies
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 11.1, 11.2, 12.2, 12.3_


- [x] 2. Implement Data Layer validation and category functions
  - [x] 2.1 Implement validation and category functions
    - Implement `allCategories(state)`: returns `[...DEFAULT_CATEGORIES, ...state.customCategories]`
    - Implement `validateTransaction(itemName, amount, category, state)`: validate trimmed itemName length 1..100, amount is finite number greater than 0 and at most 999,999,999.99, category is in `allCategories(state)`; return `{ valid, field }` identifying the first invalid field
    - Implement `validateBudget(value)`: validate finite number between 0.01 and 999,999,999.99 inclusive with at most 2 decimal places; return `{ valid }`
    - Implement `validateCustomCategory(state, name)`: validate trimmed name length 1..50, custom category count less than 100, no duplicate with default or existing custom categories (case-sensitive); return `{ valid, reason }` with reason `'length' | 'limit' | 'duplicate'`
    - Implement `setBudget(state, value)`: validate via `validateBudget`, return `{ state, error }` with new state containing updated `monthlyBudget`
    - Implement `addCustomCategory(state, name)`: validate via `validateCustomCategory`, return `{ state, error }` with new state containing appended custom category
    - _Requirements: 1.2, 1.4, 1.5, 3.1, 3.3, 3.4, 5.1, 5.2, 5.4, 5.5_



- [ ] 3. Checkpoint - Ensure validation tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Data Layer transaction operations
  - [x] 4.1 Implement transaction operations
    - Implement `nextId(state)`: return max existing transaction id plus 1, or 1 if no transactions exist
    - Implement `addTransaction(state, itemName, amount, category)`: validate via `validateTransaction`, create a Transaction with generated `id`, trimmed `itemName`, numeric `amount`, `category`, and `createdAt` set to `Date.now()`, prepend to `transactions`, reset sort to most-recent-first; return `{ state, error }`
    - Implement `deleteTransaction(state, id)`: return new state with the matching transaction filtered out
    - Implement `applySort(state, field)`: toggle direction on re-request of the same field (ascending by default), sort by `amount` numerically or by `category` alphabetically using `localeCompare`; return new state with sorted transactions and updated `sortState`
    - Implement `resetSort()`: return `{ field: null, direction: null }`
    - Ensure sort produces a stable permutation (no transactions added or lost)
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4, 12.3_



- [x] 5. Implement Data Layer derived value functions
  - [x] 5.1 Implement derived value functions
    - Implement `totalExpenses(state)`: return the sum of all transaction amounts
    - Implement `remainingBudget(state)`: return `state.monthlyBudget - totalExpenses(state)` (may be negative)
    - Implement `warningState(state)`: return `'no-budget'` if budget is 0 or less, `'overspend'` if expense ratio exceeds 1, `'approaching'` if ratio is at or above 0.80 and at most 1, else `'none'`
    - Implement `categoryTotals(state)`: return a map of category name to sum of amounts for transactions in that category
    - Implement `currentMonthTotalExpenses(state, now)`: return the sum of transaction amounts whose `createdAt` falls within the current calendar month (default `now` to `Date.now()`)
    - _Requirements: 3.3, 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 8.1, 8.2_



- [ ] 6. Checkpoint - Ensure Data Layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Storage Adapter (Persistence Layer)
  - [x] 7.1 Implement storage adapter
    - Implement `isStorageAvailable()`: test `window.localStorage` with a try/catch set/remove cycle; return boolean
    - Implement `persistState(state)`: serialize state to JSON and write to `window.localStorage` under `STORAGE_KEY`; return `{ ok: true, error: null }` on success or `{ ok: false, error: 'save_failed' }` on any exception (including quota exceeded)
    - Implement `loadState()`: read and parse the stored JSON; return `{ ok: true, state: initialState, error: null }` if no data exists, return `{ ok: true, state: normalized, error: null }` if data parses, return `{ ok: true, state: initialState, error: 'load_corrupted' }` if JSON.parse throws
    - Implement `normalizeLoadedState(parsed)`: defensively coerce a parsed blob into a well-formed state, discarding malformed entries (non-numeric amounts, missing fields) rather than throwing; fall back to `initialState` if the overall shape is unrecoverable
    - _Requirements: 3.2, 3.5, 5.3, 5.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.6_


- [ ] 8. Checkpoint - Ensure storage tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement Presentation Layer infrastructure
  - [ ] 9.1 Implement dispatch and renderAll
    - Implement `dispatch(updateFn, ...args)`: run the update function on `currentState`, surface validation errors via `showError` without mutating state, persist the new state via `persistState`, show a storage error if persistence fails while retaining in-memory state, then call `renderAll`
    - Implement `renderAll(state)`: call each controller's `render(state)` method for the current state
    - Implement `showError(message)`: display an error message in the designated error area
    - _Requirements: 1.3, 2.2, 2.5, 3.3, 4.2, 6.2, 7.3, 7.6, 8.2_

- [ ] 10. Implement DOM controllers
  - [ ] 10.1 Implement InputFormController and TransactionListController
    - Implement `InputFormController`: own the Item Name, Amount, and Category fields plus the add button; on submit, call `dispatch(addTransaction, ...)`; repopulate the Category `<select>` from `allCategories(state)` on every render; manage the custom category add control with validation via `dispatch(addCustomCategory, ...)`; display field-specific validation messages
    - Implement `TransactionListController`: render the scrollable list showing Item Name, Amount, and Category; display most-recent-first by default honoring `sortState`; wire delete buttons calling `dispatch(deleteTransaction, id)` and handle delete failure by retaining the transaction and showing an error; wire sort buttons calling `dispatch(applySort, field)`; show the empty-state message when no transactions exist
    - Render efficiently for up to 1,000 transactions (use `MAX_TRANSACTIONS_RENDER` guard)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1, 5.2, 5.4, 5.5, 12.2_

  - [ ] 10.2 Implement BudgetController, SummaryController, and ChartController
    - Implement `BudgetController`: own the budget input; on change, call `dispatch(setBudget, value)`; display validation messages for invalid entries; show storage error if budget cannot be saved while retaining the current value
    - Implement `SummaryController`: render the Remaining Budget at the top calculated as `remainingBudget(state)`; render the warning banner based on `warningState(state)` showing approaching-limit, overspend, or no-budget messages; render the Monthly Summary View with current-month total via `currentMonthTotalExpenses(state)` and remaining budget; show the "must set a monthly budget" message when `monthlyBudget` is 0
    - Implement `ChartController`: render the Chart.js pie chart from `categoryTotals(state)` using `new Chart(ctx, config)`; call `chart.update()` on re-render without requiring page reload; call `chart.destroy()` before re-creating; show the empty-state message when no transactions exist; if Chart.js is unavailable, show an error message in the chart area and leave all other functionality intact
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 8.1, 8.2, 8.3, 9.5, 10.3_

- [ ] 11. Implement bootstrap and wiring
  - [ ] 11.1 Implement bootstrap on DOMContentLoaded
    - Check `isStorageAvailable()`; if unavailable, set a global flag and show an error banner while continuing with in-memory state only
    - Call `loadState()` to get the initial state (or defaults if empty/corrupted); if `loadState` returns `load_corrupted`, show an error message
    - Detect Chart.js CDN load failure via the `onerror` handler on the script tag or a load-timeout check; if failed, show the chart-area error message
    - Wire all controllers' event handlers to their DOM elements
    - Call `renderAll(state)` for the first paint
    - _Requirements: 7.2, 7.4, 7.5, 9.5, 9.6, 10.2, 10.3, 12.1_



- [ ] 12. Apply light theme styling
  - [ ] 12.1 Complete light theme CSS
    - Apply a single light theme with a light background maintaining a contrast ratio of at least 4.5:1 between background and foreground text
    - Use readable typography with a minimum body font size of 16 pixels
    - Establish a clear visual hierarchy with at least 3 heading levels each differing by at least 25% in font size
    - Ensure no decorative background images or gradients
    - Ensure no dark-mode toggle is present
    - _Requirements: 11.1, 11.2, 11.3_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties of the pure Data Layer using fast-check with a minimum of 100 iterations per property
- Unit tests validate specific examples and edge cases (boundary values, corrupted storage, storage unavailability)
- Integration tests verify wiring, DOM structure, theme constraints, and performance budgets
- The Data Layer is pure (no I/O, no DOM access) making it the primary target for property-based testing
- The Storage Adapter wraps Local Storage with explicit failure detection and never loses in-memory data on peripheral failures
- The Presentation Layer uses a central dispatch that runs pure updates, persists, and re-renders affected regions

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "9.1"] },
    { "id": 6, "tasks": ["10.1"] },
    { "id": 7, "tasks": ["10.2"] },
    { "id": 8, "tasks": ["11.1"] },
    { "id": 9, "tasks": ["11.2", "12.1"] }
  ]
}
```
