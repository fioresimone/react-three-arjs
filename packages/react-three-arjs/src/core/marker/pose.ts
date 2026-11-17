import type { DetectionMode, MarkerPose } from '@ar-js-org/artoolkit5-ts';
import { Matrix4 } from 'three';

// ARToolKit says Z is normal to the marker; AR.js (and this library) use Y.
const MARKER_AXIS = new Matrix4().makeRotationX(Math.PI / 2);
const QUARTER_TURNS = [0, 1, 2, 3].map((k) => new Matrix4().makeRotationZ((k * Math.PI) / 2));

/** Whether the mode runs pattern and barcode detection together. */
export function isCombinedMode(mode: DetectionMode): boolean {
  return mode === 'mono_and_matrix' || mode === 'color_and_matrix';
}

/**
 * Converts an engine pose to the marker matrix used by this library: three.js
 * camera space, Y normal to the marker, X to its right, Z towards its bottom
 * edge. Matches the AR.js poses exactly.
 *
 * Works around an engine bug: in the combined pattern-and-barcode modes,
 * artoolkit5-wasm 0.4 computes pattern-marker poses as if the marker were
 * never rotated (`dir` 0), so the pose is off by `dir` quarter turns about
 * the marker normal. Barcode poses are correct in every mode, and pattern
 * poses are correct in the pattern-only modes.
 */
export function engineToMarkerMatrix(
  pose: Pick<MarkerPose, 'matrixGL' | 'type' | 'dir'>,
  detectionMode: DetectionMode,
  out: Matrix4 = new Matrix4(),
): Matrix4 {
  out.fromArray(pose.matrixGL);
  if (pose.type === 'pattern' && isCombinedMode(detectionMode)) {
    const fix = QUARTER_TURNS[((pose.dir % 4) + 4) % 4];
    if (fix) out.multiply(fix);
  }
  return out.multiply(MARKER_AXIS);
}
