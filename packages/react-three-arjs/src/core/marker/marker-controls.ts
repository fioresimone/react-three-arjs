import { Matrix4 } from 'three';
import { Emitter } from '../emitter';
import {
  createSmoother,
  VisibilityFilter,
  type PoseSmoother,
  type SmoothingOptions,
} from '../math/smoothing';

/**
 * - `'modelViewMatrix'`: the marker moves in front of a fixed camera (AR.js `<a-marker>`).
 * - `'cameraTransformMatrix'`: the marker stays at the origin and the camera moves
 *   (AR.js `<a-marker-camera>`).
 */
export type ChangeMatrixMode = 'modelViewMatrix' | 'cameraTransformMatrix';

export interface MarkerControlsOptions {
  changeMatrixMode?: ChangeMatrixMode;
  /** Pose smoothing. `false` (default) uses raw poses. */
  smoothing?: SmoothingOptions | false;
  /** ms a marker must be seen before `found` fires. Default 0. */
  foundDelay?: number;
  /** ms a marker must be missing before `lost` fires. Default 0. */
  lostDelay?: number;
}

export interface MarkerControlsEvents {
  [key: string]: unknown;
  found: { confidence: number };
  lost: undefined;
  update: { matrix: Matrix4; confidence: number };
}

/**
 * Turns raw per-frame detections into a stable pose and found/lost events.
 * The renderer-independent half of AR.js `ArMarkerControls` +
 * `ArSmoothedControls`.
 *
 * Unlike AR.js, smoothing also applies in `cameraTransformMatrix` mode (the
 * pose is smoothed first, then inverted), fixing AR.js issue #130.
 */
export class MarkerControls extends Emitter<MarkerControlsEvents> {
  /** The pose to apply: the marker's matrix, or the camera's in camera mode. */
  readonly matrix: Matrix4 = new Matrix4();
  readonly changeMatrixMode: ChangeMatrixMode;
  #smoother: PoseSmoother | null;
  #visibility: VisibilityFilter;
  #smoothed = new Matrix4();
  #confidence = 0;

  constructor(options: MarkerControlsOptions = {}) {
    super();
    this.changeMatrixMode = options.changeMatrixMode ?? 'modelViewMatrix';
    this.#smoother = options.smoothing ? createSmoother(options.smoothing) : null;
    this.#visibility = new VisibilityFilter(options.foundDelay ?? 0, options.lostDelay ?? 0);
  }

  /** Whether the marker currently counts as visible (after debouncing). */
  get visible(): boolean {
    return this.#visibility.visible;
  }

  /**
   * Feeds one processed frame. `pose` is the detected marker pose, or
   * `null` when the marker was not seen in this frame.
   */
  update(pose: Matrix4 | null, timeMs: number, confidence = 1): void {
    const wasVisible = this.#visibility.visible;
    const visible = this.#visibility.update(pose !== null, timeMs);

    if (pose) {
      this.#confidence = confidence;
      const changed = this.#smoother
        ? this.#smoother.update(pose, timeMs, this.#smoothed)
        : (this.#smoothed.copy(pose), true);
      if (changed) {
        if (this.changeMatrixMode === 'cameraTransformMatrix') {
          this.matrix.copy(this.#smoothed).invert();
        } else {
          this.matrix.copy(this.#smoothed);
        }
      }
    }

    if (!wasVisible && visible) this.emit('found', { confidence: this.#confidence });
    if (visible && pose) this.emit('update', { matrix: this.matrix, confidence: this.#confidence });
    if (wasVisible && !visible) {
      this.#smoother?.reset();
      this.emit('lost', undefined);
    }
  }

  reset(): void {
    const wasVisible = this.#visibility.visible;
    this.#visibility.reset();
    this.#smoother?.reset();
    if (wasVisible) this.emit('lost', undefined);
  }

  dispose(): void {
    this.removeAllListeners();
  }
}
