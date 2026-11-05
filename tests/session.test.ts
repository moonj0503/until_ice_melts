import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, advance, pause, resume, stop, elapsed, validateMinutes, challengeMinutes, createIceSession, validateIceSize, validateTemperature, meltShape } from '../src/session.ts';

test('rejects invalid minute inputs', () => {
  for (const value of ['', ' ', 'abc', '0', '-2', '1.5', '721', 'Infinity']) {
    assert.throws(() => validateMinutes(value));
  }
  assert.equal(validateMinutes('720'), 720);
});

test('ice size and temperature determine study time with bounded variation', () => {
  assert.equal(challengeMinutes(3, 22, () => 0.5), 50);
  assert.equal(challengeMinutes(3, 22, () => 0), 45);
  assert.equal(challengeMinutes(3, 22, () => 1), 55);
  assert.ok(challengeMinutes(5, 22, () => 0.5) > challengeMinutes(2, 22, () => 0.5));
  assert.ok(challengeMinutes(3, 10, () => 0.5) > challengeMinutes(3, 35, () => 0.5));
  assert.equal(challengeMinutes(2, 35, () => 0), 19);
  assert.equal(challengeMinutes(5, 10, () => 1), 202);
});

test('invalid physical settings cannot create a challenge', () => {
  for (const size of ['', '1.5', '5.5', '2.3', 'NaN', '2e0']) assert.throws(() => validateIceSize(size));
  for (const temperature of ['', '0', '9', '36', '22.5', 'Infinity']) assert.throws(() => validateTemperature(temperature));
  assert.equal(validateIceSize('2.5'), 2.5);
  assert.equal(validateTemperature('22'), 22);
});

test('a physical challenge retains its conditions and sampled duration during pause', () => {
  const session = createIceSession({ sizeCm: 4, temperatureC: 20 }, 1_000, 'ice', () => 0.5);
  assert.equal(session.mode, 'random');
  assert.deepEqual(session.ice, { sizeCm: 4, temperatureC: 20 });
  assert.equal(session.targetMs, 73 * 60_000);
  assert.deepEqual(resume(pause(session, 11_000), 99_000).ice, session.ice);
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
