import { BoxGeometry } from 'three';
import type { BufferAttribute } from 'three';
import { meltShape } from './session.ts';

/** The mesh owns the rounding threshold, independently of frame updates. */
export class IceGeometry extends BoxGeometry {
  private source: Float32Array;
  private deformedAt = -1;

  constructor(segments: number) {
    super(2, 2, 2, segments, segments, segments);
    this.source = Float32Array.from(this.attributes.position.array);
  }

  updateMelt(progress: number) {
    const p = Math.max(0, Math.min(1, progress));
    if (this.deformedAt >= 0 && Math.abs(this.deformedAt - p) < 0.001 && p !== 1 && p !== 0) return;
    this.deformedAt = p;
    const position = this.attributes.position as BufferAttribute;
    const radius = meltShape(p).roundness;
    const half = 1 - radius;
    for (let i = 0; i < position.count; i++) {
      const x = this.source[i * 3], y = this.source[i * 3 + 1], z = this.source[i * 3 + 2];
      const cx = Math.max(-half, Math.min(half, x)), cy = Math.max(-half, Math.min(half, y)), cz = Math.max(-half, Math.min(half, z));
      const dx = x - cx, dy = y - cy, dz = z - cz;
      const length = Math.hypot(dx, dy, dz) || 1;
      const irregular = 1 + 0.006 * Math.sin(x * 8 + y * 5) * Math.sin(z * 6 - y * 7);
      position.setXYZ(i, (cx + dx / length * radius) * irregular,
        (cy + dy / length * radius) * irregular, (cz + dz / length * radius) * irregular);
    }
    position.needsUpdate = true;
    this.computeVertexNormals();
  }
}
