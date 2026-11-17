/**
 * Reading and rotating ARToolKit camera calibration files (`camera_para.dat`).
 *
 * The file is big-endian: two int32 (xsize, ysize), a 3x4 matrix of float64
 * (the intrinsics), then nine float64 distortion factors
 * (k1, k2, p1, p2, fx, fy, x0, y0, s) for version-4 files.
 *
 * Phones deliver portrait frames when held upright, but almost every
 * calibration file, including the default one, describes a landscape camera.
 * ARToolKit then rescales the landscape intrinsics anisotropically onto the
 * portrait frame, which skews the pose. Rotating the calibration by 90 degrees
 * keeps the pixels square.
 */

const HEADER_BYTES = 8;
const MATRIX_BYTES = 12 * 8;

export interface CameraParams {
  width: number;
  height: number;
  /** 3x4 intrinsics, row-major. */
  matrix: number[];
  /** Distortion factors, as stored in the file. */
  distortion: number[];
}

export function parseCameraParams(buffer: ArrayBuffer): CameraParams {
  const view = new DataView(buffer);
  if (buffer.byteLength < HEADER_BYTES + MATRIX_BYTES) {
    throw new Error('Camera parameter file is too short.');
  }
  const width = view.getInt32(0, false);
  const height = view.getInt32(4, false);
  const matrix: number[] = [];
  for (let i = 0; i < 12; i++) matrix.push(view.getFloat64(HEADER_BYTES + i * 8, false));
  const distortion: number[] = [];
  const distCount = Math.floor((buffer.byteLength - HEADER_BYTES - MATRIX_BYTES) / 8);
  for (let i = 0; i < distCount; i++) {
    distortion.push(view.getFloat64(HEADER_BYTES + MATRIX_BYTES + i * 8, false));
  }
  return { width, height, matrix, distortion };
}

export function serializeCameraParams(params: CameraParams): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER_BYTES + MATRIX_BYTES + params.distortion.length * 8);
  const view = new DataView(buffer);
  view.setInt32(0, params.width, false);
  view.setInt32(4, params.height, false);
  params.matrix.forEach((v, i) => view.setFloat64(HEADER_BYTES + i * 8, v, false));
  params.distortion.forEach((v, i) =>
    view.setFloat64(HEADER_BYTES + MATRIX_BYTES + i * 8, v, false),
  );
  return buffer;
}

/**
 * Rotates calibration parameters by 90 degrees clockwise, turning a
 * landscape calibration into a portrait one.
 */
export function rotateCameraParams(params: CameraParams): CameraParams {
  const { width: w, height: h, matrix: m, distortion: d } = params;
  const fx = m[0] ?? 0;
  const cx = m[2] ?? 0;
  const fy = m[5] ?? 0;
  const cy = m[6] ?? 0;
  const matrix = [fy, 0, h - 1 - cy, 0, 0, fx, cx, 0, 0, 0, 1, 0];
  const distortion = [...d];
  if (d.length >= 9) {
    // k1, k2 are radial and rotation-invariant; tangential terms and the
    // distortion intrinsics swap axes like the main intrinsics do.
    distortion[2] = d[3] ?? 0;
    distortion[3] = d[2] ?? 0;
    distortion[4] = d[5] ?? 0;
    distortion[5] = d[4] ?? 0;
    distortion[6] = h - 1 - (d[7] ?? 0);
    distortion[7] = d[6] ?? 0;
  }
  return { width: h, height: w, matrix, distortion };
}
