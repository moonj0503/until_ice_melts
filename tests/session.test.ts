import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, advance, pause, resume, stop, elapsed, validateMinutes, randomMinutes, meltShape } from '../src/session.ts';

test('rejects invalid minute inputs and reversed ranges', () => {
  for (const value of ['', ' ', 'abc', '0', '-2', '1.5', '721', 'Infinity']) {
    assert.throws(() => validateMinutes(value));
  }
  assert.equal(validateMinutes('720'), 720);
  assert.throws(() => randomMinutes(90, 30));
});

test('random range includes both endpoints and equal bounds', () => {
  assert.equal(randomMinutes(30, 90, () => 0), 30);
  assert.equal(randomMinutes(30, 90, () => 0.9999999), 90);
  assert.equal(randomMinutes(40, 40, () => 0.4), 40);
});

test('wall-clock elapsed time survives background throttling and caps at target', () => {
  const s = createSession('fixed', 2, 1_000, 'one');
  assert.equal(elapsed(s, 61_000), 60_000);
  assert.equal(elapsed(s, 999_000), 120_000);
  const done = advance(s, 999_000);
  assert.equal(done.status, 'completed');
  assert.equal(done.finishedAt, 121_000);
  assert.equal(done.elapsedMs, 120_000);
});

test('multiple pauses exclude all rest and keep original random target', () => {
  let s = createSession('random', 3, 1_000, 'random');
  s = pause(s, 11_000);
  assert.equal(elapsed(s, 111_000), 10_000);
  s = resume(s, 111_000);
  s = pause(s, 121_000);
  s = resume(s, 221_000);
  assert.equal(elapsed(s, 231_000), 30_000);
  assert.equal(s.targetMs, 180_000);
  assert.equal(advance(pause(s, 231_000), 999_000).status, 'paused');
});

test('stopping at the boundary completes rather than recording an interruption', () => {
  const s = createSession('fixed', 1, 1_000, 'boundary');
  assert.equal(stop(s, 61_000).status, 'completed');
  assert.equal(stop(s, 11_000).status, 'stopped');
  assert.equal(stop(pause(s, 11_000), 91_000).elapsedMs, 10_000);
  const done = advance(s, 61_000);
  assert.deepEqual(stop(done, 80_000), done);
  assert.deepEqual(resume(done, 80_000), done);
});

test('wall-clock changes do not produce negative elapsed time', () => {
  const s = createSession('fixed', 1, 10_000, 'clock');
  assert.equal(elapsed(s, 5_000), 0);
});

test('ice disappears at completion and puddle grows with melting', () => {
  const start = meltShape(0), middle = meltShape(0.5), end = meltShape(1);
  assert.ok(start.scale > middle.scale);
  assert.equal(end.scale, 0);
  assert.ok(start.water < middle.water && middle.water < end.water);
  assert.ok(start.roundness < middle.roundness);
  assert.deepEqual(meltShape(2), end);
});
