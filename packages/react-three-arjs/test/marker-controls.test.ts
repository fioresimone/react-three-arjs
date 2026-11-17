import { Matrix4 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MarkerControls } from '../src/core/marker/marker-controls';

const pose = new Matrix4().makeTranslation(0.1, 0.2, -3);

describe('MarkerControls', () => {
  it('emits found, update and lost', () => {
    const c = new MarkerControls();
    const found = vi.fn();
    const update = vi.fn();
    const lost = vi.fn();
    c.on('found', found);
    c.on('update', update);
    c.on('lost', lost);

    c.update(pose, 0, 0.9);
    expect(found).toHaveBeenCalledWith({ confidence: 0.9 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(c.matrix.equals(pose)).toBe(true);

    c.update(null, 16);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(c.visible).toBe(false);
  });

  it('camera mode inverts the pose', () => {
    const c = new MarkerControls({ changeMatrixMode: 'cameraTransformMatrix' });
    c.update(pose, 0);
    expect(c.matrix.clone().multiply(pose).equals(new Matrix4())).toBe(true);
  });

  it('smooths in camera mode too (AR.js issue #130)', () => {
    const c = new MarkerControls({
      changeMatrixMode: 'cameraTransformMatrix',
      smoothing: { type: 'lerp' },
    });
    c.update(new Matrix4().makeTranslation(0, 0, -1), 0);
    c.update(new Matrix4().makeTranslation(0, 0, -2), 1000 / 60);
    // Smoothed pose is at z = -1.8, so the camera is at +1.8.
    expect(c.matrix.elements[14]).toBeCloseTo(1.8, 5);
  });

  it('honours lostDelay', () => {
    const c = new MarkerControls({ lostDelay: 100 });
    const lost = vi.fn();
    c.on('lost', lost);
    c.update(pose, 0);
    c.update(null, 50);
    expect(lost).not.toHaveBeenCalled();
    c.update(null, 150);
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('reset() reports a visible marker as lost', () => {
    const c = new MarkerControls();
    const lost = vi.fn();
    c.on('lost', lost);
    c.update(pose, 0);
    c.reset();
    expect(lost).toHaveBeenCalledTimes(1);
  });
});
