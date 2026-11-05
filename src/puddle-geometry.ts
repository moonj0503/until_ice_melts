import { BufferGeometry, Float32BufferAttribute } from 'three';

function parameters(seed: string) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  const random = () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  return [
    [2, 0.08 + random() * 0.06, random() * Math.PI * 2],
    [3, 0.07 + random() * 0.05, random() * Math.PI * 2],
    [4, 0.025 + random() * 0.035, random() * Math.PI * 2],
    [5, 0.02 + random() * 0.02, random() * Math.PI * 2],
    [7, 0.008 + random() * 0.014, random() * Math.PI * 2],
  ];
}

/** Low-frequency periodic lobes: smooth, asymmetric, positive-radius contours. */
export function puddleRadius(seed: string, angle: number): number {
  return parameters(seed).reduce((radius, [frequency, amplitude, phase]) => radius + amplitude * Math.sin(frequency * angle + phase), 1);
}

/** Local XY surface, with Z height forming a thin curved capillary edge. */
export class PuddleGeometry extends BufferGeometry {
  constructor(seed: string, segments = 128, rings = 12) {
    super();
    const positions = [0, 0, 0.0035];
    const radii = [0];
    const indices: number[] = [];
    const outline = Array.from({ length: segments }, (_, i) => puddleRadius(seed, i * Math.PI * 2 / segments));
    for (let ring = 1; ring <= rings; ring++) {
      const r = 1 - Math.pow(1 - ring / rings, 2);
      const height = 0.0035 * (1 - r * r) + 0.014 * Math.exp(-Math.pow((r - 0.972) / 0.018, 2));
      for (let i = 0; i < segments; i++) {
        const angle = i * Math.PI * 2 / segments;
        positions.push(Math.cos(angle) * outline[i] * r, Math.sin(angle) * outline[i] * r, height);
        radii.push(r);
        const current = 1 + (ring - 1) * segments + i;
        const next = 1 + (ring - 1) * segments + (i + 1) % segments;
        if (ring === 1) indices.push(0, current, next);
        else {
          const inner = current - segments, innerNext = next - segments;
          indices.push(inner, current, next, inner, next, innerNext);
        }
      }
    }
    this.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.setAttribute('wetRadius', new Float32BufferAttribute(radii, 1));
    this.setIndex(indices);
    this.computeVertexNormals();
    this.computeBoundingSphere();
  }
}
