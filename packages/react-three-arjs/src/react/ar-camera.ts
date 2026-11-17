import { PerspectiveCamera } from 'three';
import { fitProjectionToView, type FitMode } from '../core/math/projection';

/**
 * A perspective camera that can take ARToolKit's calibrated projection.
 *
 * R3F sets `aspect` and calls `updateProjectionMatrix()` on every resize.
 * With an AR projection set, this override fits that projection to the new
 * view instead of building a frustum from `fov`, so resizing never breaks
 * the alignment between video and 3D content, and raycasting (R3F pointer
 * events) uses the same matrix.
 */
export class ARCamera extends PerspectiveCamera {
  /** Column-major projection for the full source frame, or null to use `fov`. */
  arProjection: ArrayLike<number> | null = null;
  /** Width / height of the source frame. */
  sourceAspect: number = 4 / 3;
  fit: FitMode = 'cover';

  override updateProjectionMatrix(): void {
    if (!this.arProjection) {
      super.updateProjectionMatrix();
      return;
    }
    fitProjectionToView(
      this.arProjection,
      this.sourceAspect,
      this.aspect,
      this.fit,
      this.projectionMatrix.elements,
    );
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}
