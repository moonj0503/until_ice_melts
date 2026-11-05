import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PuddleGeometry, puddleRadius } from '../src/puddle-geometry.ts';

test('a session seed gives a reproducible, closed, irregular water outline', () => {
  const angles = Array.from({ length: 128 }, (_, i) => i * Math.PI * 2 / 128);
  const first = angles.map(a => puddleRadius('session-a', a));
  assert.deepEqual(angles.map(a => puddleRadius('session-a', a)), first);
  assert.notDeepEqual(angles.map(a => puddleRadius('session-b', a)), first);
  assert.ok(Math.abs(puddleRadius('session-a', 0) - puddleRadius('session-a', Math.PI * 2)) < 1e-12);
  // An ellipse is centrally symmetric; these puddles deliberately are not.
  assert.ok(angles.slice(0, 64).some((a, i) => Math.abs(first[i] - puddleRadius('session-a', a + Math.PI)) > 0.1));
});

test('many seeds have bounded smooth contours with no folds through their center', () => {
  for (let seed = 0; seed < 40; seed++) {
    let previous = puddleRadius(String(seed), 0);
    for (let i = 1; i <= 256; i++) {
      const radius = puddleRadius(String(seed), i * Math.PI * 2 / 256);
      assert.ok(radius > 0.55 && radius < 1.45);
      assert.ok(Math.abs(radius - previous) < 0.065);
      previous = radius;
    }
  }
});

test('water mesh is finite with upward facing faces, continuous seam and a raised meniscus', () => {
  const geometry = new PuddleGeometry('mesh', 64, 12);
  const positions = geometry.attributes.position;
  const radial = geometry.attributes.wetRadius;
  assert.ok([...positions.array].every(Number.isFinite));
  assert.ok([...geometry.attributes.normal.array].every(Number.isFinite));
  let edgeHeight = 0, rimHeight = 0;
  for (let i = 0; i < positions.count; i++) {
    if (radial.getX(i) === 1) edgeHeight = Math.max(edgeHeight, positions.getZ(i));
    if (radial.getX(i) > 0.85 && radial.getX(i) < 1) rimHeight = Math.max(rimHeight, positions.getZ(i));
  }
  assert.ok(rimHeight > edgeHeight + 0.005);
  const index = geometry.index!;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    const cross = (positions.getX(b) - positions.getX(a)) * (positions.getY(c) - positions.getY(a))
      - (positions.getY(b) - positions.getY(a)) * (positions.getX(c) - positions.getX(a));
    assert.ok(cross > 0);
  }
  geometry.dispose();
});
