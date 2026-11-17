/** How the camera image is fitted into the view, matching CSS `object-fit`. */
export type FitMode = 'cover' | 'contain';

/**
 * Adapts a projection matrix computed for the full camera frame to a view
 * that shows that frame with `object-fit: cover` or `contain`.
 *
 * AR.js resized the renderer canvas to the video's aspect and let CSS stretch
 * both, which is the source of the stretched feed and wide-angle reports
 * (AR.js issues #498 and #303). Here the video keeps its aspect and the
 * projection is scaled by exactly the crop CSS applies, so virtual content
 * stays aligned with the image at any view size.
 *
 * Works on any column-major 4x4 matrix: row 0 (x) is at indices 0, 4, 8, 12
 * and row 1 (y) at 1, 5, 9, 13.
 */
export function fitProjectionToView(
  projection: ArrayLike<number>,
  sourceAspect: number,
  viewAspect: number,
  fit: FitMode = 'cover',
  out: Float32Array | number[] = new Float32Array(16),
): Float32Array | number[] {
  for (let i = 0; i < 16; i++) out[i] = projection[i] ?? 0;
  if (!(sourceAspect > 0) || !(viewAspect > 0)) return out;

  const viewIsWider = viewAspect > sourceAspect;
  let sx = 1;
  let sy = 1;
  if (fit === 'cover') {
    if (viewIsWider) sy = viewAspect / sourceAspect;
    else sx = sourceAspect / viewAspect;
  } else {
    if (viewIsWider) sx = sourceAspect / viewAspect;
    else sy = viewAspect / sourceAspect;
  }
  for (const i of [0, 4, 8, 12]) out[i] = (out[i] ?? 0) * sx;
  for (const i of [1, 5, 9, 13]) out[i] = (out[i] ?? 0) * sy;
  return out;
}

/**
 * Size of the frame handed to the detector: the source aspect, with the
 * longer side capped at `maxSize`. AR.js always used a 640x480 canvas and
 * stretched other aspects into it; keeping the real aspect avoids that
 * distortion.
 */
export function processingSize(
  sourceWidth: number,
  sourceHeight: number,
  maxSize = 640,
): { width: number; height: number } {
  const longest = Math.max(sourceWidth, sourceHeight);
  const scale = longest > maxSize ? maxSize / longest : 1;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}
