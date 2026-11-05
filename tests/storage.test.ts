import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, pause, advance } from '../src/session.ts';
import { loadState, persistState, reconcile, freshState, STORAGE_KEY } from '../src/storage.ts';

function memory() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); } };
}

test('restores a random session without changing its target', () => {
  const storage = memory();
  const state = { ...freshState(), session: createSession('random', 47, 1_000, 'restore') };
  assert.equal(persistState(storage, state), true);
  const loaded = loadState(storage, 61_000);
  assert.equal(loaded.state.session?.targetMs, 47 * 60_000);
  assert.equal(loaded.state.session?.status, 'running');
});

test('expired sessions are recorded once at target time across repeated reloads', () => {
  const storage = memory();
  persistState(storage, { ...freshState(), session: createSession('fixed', 1, 1_000, 'expired') });
  const first = loadState(storage, 999_000).state;
  assert.equal(first.session?.status, 'completed');
  assert.equal(first.records.length, 1);
  assert.equal(first.records[0].elapsedMs, 60_000);
  assert.equal(first.records[0].finishedAt, 61_000);
  persistState(storage, first);
  const second = loadState(storage, 999_999).state;
  assert.equal(reconcile(second, 999_999).records.length, 1);
});

test('paused sessions remain paused after reopening', () => {
  const storage = memory();
  const s = pause(createSession('fixed', 1, 1_000, 'paused'), 11_000);
  persistState(storage, { ...freshState(), session: s });
  const restored = loadState(storage, 999_000).state;
  assert.equal(restored.session?.status, 'paused');
  assert.equal(restored.session?.elapsedMs, 10_000);
  assert.equal(restored.records.length, 0);
});

test('corrupt or structurally invalid data is handled without trusting it', () => {
  const storage = memory();
  for (const value of ['{', 'null', '{"version":1,"records":[]}', '{"version":99}', JSON.stringify({ ...freshState(), session: { id: '<script>' } })]) {
    storage.setItem(STORAGE_KEY, value);
    const loaded = loadState(storage, 1_000);
    assert.equal(loaded.state.session, null);
    assert.equal(loaded.state.records.length, 0);
    assert.ok(loaded.warning);
  }
});

test('blocked storage reports failure instead of crashing', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.ok(loadState(storage, 1_000).warning);
  assert.equal(persistState(storage, freshState()), false);
});

test('reconciliation is idempotent and history is newest first', () => {
  const first = advance(createSession('fixed', 1, 1_000, 'first'), 61_000);
  let state = reconcile({ ...freshState(), session: first }, 61_000);
  state = reconcile({ ...state, session: advance(createSession('random', 1, 70_000, 'second'), 130_000) }, 130_000);
  assert.deepEqual(reconcile(state, 200_000).records.map(r => r.id), ['second', 'first']);
});

test('unrepresentable dates in persisted data cannot crash history rendering', () => {
  const storage = memory();
  const invalid = advance(createSession('fixed', 1, 1_000, 'date'), 61_000);
  invalid.startedAt = 1e30;
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...freshState(), records: [invalid] }));
  const result = loadState(storage, 80_000);
  assert.equal(result.state.records.length, 0);
  assert.ok(result.warning);
});
