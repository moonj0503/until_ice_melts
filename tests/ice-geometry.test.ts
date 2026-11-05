import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IceGeometry } from '../src/ice-geometry.ts';

test('small accumulated progress updates still round ice corners', () => {
  const geometry = new IceGeometry(12);
  geometry.updateMelt(0);
  const before = geometry.attributes.position.getX(0);
  for (let i = 1; i <= 100; i++) geometry.updateMelt(i / 10_000);
  const after = geometry.attributes.position.getX(0);
  assert.ok(Math.abs(after) < Math.abs(before));
  assert.ok([...geometry.attributes.normal.array].every(Number.isFinite));
  geometry.dispose();
});
