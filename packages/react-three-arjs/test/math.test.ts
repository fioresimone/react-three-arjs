import { readFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  parseCameraParams,
  rotateCameraParams,
  serializeCameraParams,
} from '../src/core/math/camera-params';
import { fitProjectionToView, processingSize } from '../src/core/math/projection';
import { createSmoother, OneEuroFilter, VisibilityFilter } from '../src/core/math/smoothing';

const identity = new Matrix4().elements;

describe('fitProjectionToView', () => {
  it('leaves the matrix alone when aspects match', () => {
    expect([...fitProjectionToView(identity, 4 / 3, 4 / 3)]).toEqual(identity);
  });

  it('cover: zooms vertically when the view is wider than the source', () => {
    const m = fitProjectionToView(identity, 4 / 3, 16 / 9, 'cover');
    expect(m[0]).toBeCloseTo(1);
    expect(m[5]).toBeCloseTo(16 / 9 / (4 / 3));
  });

  it('cover: zooms horizontally when the view is taller than the source', () => {
    const m = fitProjectionToView(identity, 4 / 3, 9 / 16, 'cover');
    expect(m[0]).toBeCloseTo(4 / 3 / (9 / 16));
    expect(m[5]).toBeCloseTo(1);
  });

  it('contain: shrinks instead of zooming', () => {
    const m = fitProjectionToView(identity, 4 / 3, 16 / 9, 'contain');
    expect(m[0]).toBeCloseTo(4 / 3 / (16 / 9));
    expect(m[5]).toBeCloseTo(1);
  });

  it('keeps a point at the source edge on the visible edge (cover)', () => {
    // Source 4:3 shown in a 2:1 view: the visible band is the middle 2/3 of the height.
    const m = new Matrix4().fromArray(fitProjectionToView(identity, 4 / 3, 2, 'cover'));
    const p = new Vector3(0, 2 / 3, 0).applyMatrix4(m);
    expect(p.y).toBeCloseTo(1);
  });
});

describe('processingSize', () => {
  it('keeps the aspect and caps the longer side', () => {
    expect(processingSize(1280, 720)).toEqual({ width: 640, height: 360 });
    expect(processingSize(720, 1280)).toEqual({ width: 360, height: 640 });
    expect(processingSize(320, 240)).toEqual({ width: 320, height: 240 });
  });
});

describe('camera parameters', () => {
  const file = readFileSync(new URL('../src/assets/camera_para.dat', import.meta.url));
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);

  it('parses the AR.js calibration', () => {
    const p = parseCameraParams(buffer);
    expect(p.width).toBe(640);
    expect(p.height).toBe(480);
    expect(p.matrix[0]).toBeCloseTo(609.365, 2);
    expect(p.distortion).toHaveLength(9);
  });

  it('round-trips through serialisation byte for byte', () => {
    const out = new Uint8Array(serializeCameraParams(parseCameraParams(buffer)));
    expect(Buffer.from(out).equals(file)).toBe(true);
  });

  it('rotates to portrait, swapping focal lengths', () => {
    const p = parseCameraParams(buffer);
    const r = rotateCameraParams(p);
    expect([r.width, r.height]).toEqual([480, 640]);
    expect(r.matrix[0]).toBe(p.matrix[5]);
    expect(r.matrix[5]).toBe(p.matrix[0]);
    expect(r.matrix[6]).toBe(p.matrix[2]);
  });
});

describe('smoothing', () => {
  // Moves two matrix entries, as AR.js needs `threshold` (2) entries to change.
  const pose = (x: number): Matrix4 => new Matrix4().makeTranslation(x, x, -5);

  it('average: holds still on small jitter, follows real movement', () => {
    const s = createSmoother({ type: 'average', count: 3 });
    const out = new Matrix4();
    for (let i = 0; i < 4; i++) s.update(pose(0), i * 16, out);
    expect(s.update(pose(0.001), 64, out)).toBe(false);
    expect(s.update(pose(1), 80, out)).toBe(true);
    expect(out.elements[12]).toBeGreaterThan(0);
    expect(out.elements[12]).toBeLessThan(1);
  });

  it('lerp: converges towards the target', () => {
    const s = createSmoother({ type: 'lerp' });
    const out = new Matrix4();
    s.update(pose(0), 0, out);
    s.update(pose(1), 1000 / 60, out);
    expect(out.elements[12]).toBeCloseTo(0.8, 5);
    s.update(pose(1), 1000, out);
    expect(out.elements[12]).toBeCloseTo(1, 5);
  });

  it('one-euro: reduces jitter of a still marker', () => {
    const s = createSmoother({ type: 'one-euro', minCutoff: 1, beta: 0 });
    const out = new Matrix4();
    let maxDev = 0;
    for (let i = 0; i < 60; i++) {
      const noise = i % 2 ? 0.05 : -0.05;
      s.update(pose(noise), i * 16, out);
      if (i > 10) maxDev = Math.max(maxDev, Math.abs(out.elements[12] ?? 0));
    }
    expect(maxDev).toBeLessThan(0.02);
  });

  it('one-euro: never averages across the quaternion sign flip', () => {
    const s = createSmoother({ type: 'one-euro' });
    const out = new Matrix4();
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.5);
    const m = (qq: Quaternion): Matrix4 =>
      new Matrix4().compose(new Vector3(), qq, new Vector3(1, 1, 1));
    s.update(m(q), 0, out);
    // The same rotation with every component negated.
    s.update(m(new Quaternion(-q.x, -q.y, -q.z, -q.w)), 16, out);
    const result = new Quaternion().setFromRotationMatrix(out);
    expect(Math.abs(result.dot(q))).toBeCloseTo(1, 5);
  });

  it('OneEuroFilter passes the first value through', () => {
    expect(new OneEuroFilter().filter(3, 0)).toBe(3);
  });
});

describe('VisibilityFilter', () => {
  it('debounces found and lost', () => {
    const v = new VisibilityFilter(100, 200);
    expect(v.update(true, 0)).toBe(false);
    expect(v.update(true, 99)).toBe(false);
    expect(v.update(true, 100)).toBe(true);
    expect(v.update(false, 150)).toBe(true);
    expect(v.update(true, 200)).toBe(true); // a single missed frame is ignored
    expect(v.update(false, 300)).toBe(true);
    expect(v.update(false, 499)).toBe(true);
    expect(v.update(false, 500)).toBe(false);
  });
});
