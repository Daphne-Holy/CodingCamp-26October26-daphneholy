// Unit tests for Task 4.1: transaction operations in the pure Data Layer.
// Covers nextId, addTransaction, deleteTransaction, applySort, and resetSort
// with specific examples and edge cases (empty state, boundary toggling,
// stable permutation, non-mutation of input state).
import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  addTransaction,
  deleteTransaction,
  applySort,
  resetSort,
  nextId
} from '../js/app.js';

// Helper: build a transaction object with a known id/order.
function tx(id, itemName, amount, category, createdAt) {
  return { id, itemName, amount, category, createdAt };
}

// Helper: add several valid transactions to a fresh state via addTransaction.
function stateWithTransactions(specs) {
  let s = createInitialState();
  for (const spec of specs) {
    const r = addTransaction(s, spec.itemName, spec.amount, spec.category);
    expect(r.error).toBeNull();
    s = r.state;
  }
  return s;
}

describe('nextId', () => {
  it('returns 1 when there are no transactions', () => {
    expect(nextId(createInitialState())).toBe(1);
  });

  it('returns max id plus one', () => {
    const s = createInitialState();
    s.transactions = [tx(3, 'a', 1, 'Food', 1), tx(7, 'b', 2, 'Food', 2)];
    expect(nextId(s)).toBe(8);
  });

  it('does not mutate the input state', () => {
    const s = createInitialState();
    s.transactions = [tx(5, 'a', 1, 'Food', 1)];
    nextId(s);
    expect(s.transactions).toHaveLength(1);
  });
});

describe('addTransaction', () => {
  it('prepends a valid transaction and increases length by one', () => {
    const s = stateWithTransactions([{ itemName: 'First', amount: 10, category: 'Food' }]);
    const r = addTransaction(s, 'Lunch', 12.5, 'Food');
    expect(r.error).toBeNull();
    expect(r.state.transactions).toHaveLength(2);
    // Most-recent-first: the new transaction is at index 0.
    expect(r.state.transactions[0].itemName).toBe('Lunch');
  });

  it('assigns a unique monotonically increasing id', () => {
    const s = stateWithTransactions([{ itemName: 'First', amount: 10, category: 'Food' }]);
    const r = addTransaction(s, 'Second', 5, 'Food');
    expect(r.state.transactions[0].id).toBe(2);
  });

  it('stores a trimmed item name and numeric amount', () => {
    const r = addTransaction(createInitialState(), '  Lunch  ', '12.50', 'Food');
    expect(r.error).toBeNull();
    expect(r.state.transactions[0].itemName).toBe('Lunch');
    expect(r.state.transactions[0].amount).toBe(12.5);
    expect(typeof r.state.transactions[0].amount).toBe('number');
  });

  it('sets createdAt to a positive epoch milliseconds value', () => {
    const before = Date.now();
    const r = addTransaction(createInitialState(), 'X', 5, 'Food');
    const after = Date.now();
    const ts = r.state.transactions[0].createdAt;
    expect(typeof ts).toBe('number');
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('resets sortState to most-recent-first on add', () => {
    const s = createInitialState();
    s.sortState = { field: 'amount', direction: 'desc' };
    const r = addTransaction(s, 'X', 5, 'Food');
    expect(r.state.sortState).toEqual({ field: null, direction: null });
  });

  it('leaves other transactions unchanged', () => {
    const s = stateWithTransactions([{ itemName: 'First', amount: 10, category: 'Food' }]);
    const existing = s.transactions[0];
    const r = addTransaction(s, 'Second', 5, 'Food');
    // The previously-added transaction should still be present and unchanged.
    const other = r.state.transactions.find(t => t.itemName === 'First');
    expect(other).toEqual(existing);
  });

  it('does not mutate the original state on success', () => {
    const s = createInitialState();
    addTransaction(s, 'X', 5, 'Food');
    expect(s.transactions).toHaveLength(0);
  });

  it('returns the original state reference and error field on invalid input', () => {
    const s = createInitialState();
    const r = addTransaction(s, '', 5, 'Food');
    expect(r.error).toBe('itemName');
    expect(r.state).toBe(s);
  });

  it('reports the amount field for an invalid amount', () => {
    const s = createInitialState();
    const r = addTransaction(s, 'X', 0, 'Food');
    expect(r.error).toBe('amount');
    expect(r.state).toBe(s);
  });

  it('reports the category field for an unknown category', () => {
    const s = createInitialState();
    const r = addTransaction(s, 'X', 5, 'Unknown');
    expect(r.error).toBe('category');
    expect(r.state).toBe(s);
  });
});

describe('deleteTransaction', () => {
  it('removes the matching transaction and decreases length by one', () => {
    const s = stateWithTransactions([
      { itemName: 'A', amount: 1, category: 'Food' },
      { itemName: 'B', amount: 2, category: 'Food' }
    ]);
    const idToDelete = s.transactions[1].id;
    const next = deleteTransaction(s, idToDelete);
    expect(next.transactions).toHaveLength(1);
    expect(next.transactions.find(t => t.id === idToDelete)).toBeUndefined();
  });

  it('leaves remaining transactions unchanged', () => {
    const s = stateWithTransactions([
      { itemName: 'A', amount: 1, category: 'Food' },
      { itemName: 'B', amount: 2, category: 'Food' }
    ]);
    const keep = s.transactions[0];
    const next = deleteTransaction(s, s.transactions[1].id);
    expect(next.transactions[0]).toEqual(keep);
  });

  it('does not mutate the original state', () => {
    const s = stateWithTransactions([{ itemName: 'A', amount: 1, category: 'Food' }]);
    deleteTransaction(s, s.transactions[0].id);
    expect(s.transactions).toHaveLength(1);
  });

  it('returns a copy with an equivalent list when the id does not exist', () => {
    const s = stateWithTransactions([
      { itemName: 'A', amount: 1, category: 'Food' },
      { itemName: 'B', amount: 2, category: 'Food' }
    ]);
    const next = deleteTransaction(s, 99999);
    expect(next.transactions).toHaveLength(2);
    // Contents preserved (order and values).
    expect(next.transactions.map(t => t.itemName)).toEqual(['B', 'A']);
  });
});

describe('applySort', () => {
  it('sorts by amount in ascending order by default', () => {
    const s = stateWithTransactions([
      { itemName: 'big', amount: 30, category: 'Food' },
      { itemName: 'small', amount: 5, category: 'Food' },
      { itemName: 'mid', amount: 20, category: 'Food' }
    ]);
    const r = applySort(s, 'amount');
    expect(r.sortState).toEqual({ field: 'amount', direction: 'asc' });
    expect(r.transactions.map(t => t.amount)).toEqual([5, 20, 30]);
  });

  it('toggles to descending when the same amount sort is requested again', () => {
    const s = stateWithTransactions([
      { itemName: 'big', amount: 30, category: 'Food' },
      { itemName: 'small', amount: 5, category: 'Food' },
      { itemName: 'mid', amount: 20, category: 'Food' }
    ]);
    const asc = applySort(s, 'amount');
    const desc = applySort(asc, 'amount');
    expect(desc.sortState).toEqual({ field: 'amount', direction: 'desc' });
    expect(desc.transactions.map(t => t.amount)).toEqual([30, 20, 5]);
  });

  it('sorts by category alphabetically in ascending order by default', () => {
    const s = stateWithTransactions([
      { itemName: 'z', amount: 1, category: 'Fun' },
      { itemName: 'a', amount: 1, category: 'Food' },
      { itemName: 'm', amount: 1, category: 'Transport' }
    ]);
    const r = applySort(s, 'category');
    expect(r.sortState).toEqual({ field: 'category', direction: 'asc' });
    expect(r.transactions.map(t => t.category)).toEqual(['Food', 'Fun', 'Transport']);
  });

  it('toggles to descending when the same category sort is requested again', () => {
    const s = stateWithTransactions([
      { itemName: 'z', amount: 1, category: 'Fun' },
      { itemName: 'a', amount: 1, category: 'Food' },
      { itemName: 'm', amount: 1, category: 'Transport' }
    ]);
    const asc = applySort(s, 'category');
    const desc = applySort(asc, 'category');
    expect(desc.sortState).toEqual({ field: 'category', direction: 'desc' });
    expect(desc.transactions.map(t => t.category)).toEqual(['Transport', 'Fun', 'Food']);
  });

  it('starts ascending when switching to a new field after sorting another', () => {
    const s = stateWithTransactions([
      { itemName: 'big', amount: 30, category: 'Fun' },
      { itemName: 'small', amount: 5, category: 'Food' }
    ]);
    const byAmount = applySort(s, 'amount'); // asc
    const byCategory = applySort(byAmount, 'category'); // new field -> asc
    expect(byCategory.sortState).toEqual({ field: 'category', direction: 'asc' });
    expect(byCategory.transactions.map(t => t.category)).toEqual(['Food', 'Fun']);
  });

  it('produces a stable permutation with no transactions added or lost', () => {
    const s = stateWithTransactions([
      { itemName: 'big', amount: 30, category: 'Food' },
      { itemName: 'small', amount: 5, category: 'Food' },
      { itemName: 'mid', amount: 20, category: 'Food' },
      { itemName: 'mid2', amount: 20, category: 'Food' }
    ]);
    const originalIds = s.transactions.map(t => t.id).sort((a, b) => a - b);
    const r = applySort(s, 'amount');
    expect(r.transactions).toHaveLength(s.transactions.length);
    const sortedIds = r.transactions.map(t => t.id).sort((a, b) => a - b);
    expect(sortedIds).toEqual(originalIds);
  });

  it('does not mutate the original state', () => {
    const s = stateWithTransactions([
      { itemName: 'big', amount: 30, category: 'Food' },
      { itemName: 'small', amount: 5, category: 'Food' }
    ]);
    const originalOrder = s.transactions.map(t => t.amount);
    applySort(s, 'amount');
    expect(s.transactions.map(t => t.amount)).toEqual(originalOrder);
  });

  it('handles an empty transaction list without error', () => {
    const r = applySort(createInitialState(), 'amount');
    expect(r.transactions).toHaveLength(0);
    expect(r.sortState).toEqual({ field: 'amount', direction: 'asc' });
  });
});

describe('resetSort', () => {
  it('returns a fresh sort state with null field and direction', () => {
    expect(resetSort()).toEqual({ field: null, direction: null });
  });
});
