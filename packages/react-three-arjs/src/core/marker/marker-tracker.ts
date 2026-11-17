import {
  configureDetector,
  createARToolKitState,
  getCameraProjectionMatrix,
  loadPatternMarker,
  processFrame,
  trackBarcodeMarker,
  trackMarker,
  type ARToolKitState,
  type DetectionMode,
  type ImageProcMode,
  type LabelingMode,
  type MatrixCodeType,
  type ThresholdMode,
} from '@ar-js-org/artoolkit5-ts';
import { Matrix4 } from 'three';
import { CAMERA_PARAMETERS_URL } from '../../assets/inline.generated';
import { ArError } from '../errors';
import {
  parseCameraParams,
  rotateCameraParams,
  serializeCameraParams,
} from '../math/camera-params';
import { processingSize } from '../math/projection';
import type { SourceElement } from '../source/source';
import { engineToMarkerMatrix } from './pose';

export type { DetectionMode, ImageProcMode, LabelingMode, MatrixCodeType, ThresholdMode };

/** Detector settings. Names follow AR.js `ArToolkitContext` where one existed. */
export interface MarkerTrackerOptions {
  /** URL of `camera_para.dat`. Defaults to the AR.js file, bundled. */
  cameraParametersUrl?: string;
  /**
   * URL of `artoolkit5.wasm`. Defaults to a copy inlined in a lazily loaded
   * chunk, which works in every bundler; serving the file yourself saves
   * about 90 KB of transfer.
   */
  wasmUrl?: string;
  /** Longer side of the frame given to the detector, in pixels. Default 640. */
  maxProcessingSize?: number;
  /** Default `'mono_and_matrix'`, so pattern and barcode markers both work. */
  detectionMode?: DetectionMode;
  /** Barcode dictionary. Default `'3x3'`. */
  matrixCodeType?: MatrixCodeType;
  /** Default `'black_region'`. */
  labelingMode?: LabelingMode;
  /** Inner pattern size relative to the whole marker. Default 0.5. */
  patternRatio?: number;
  /** Binarisation threshold, 0-255, used when `thresholdMode` is manual. */
  threshold?: number;
  thresholdMode?: ThresholdMode;
  imageProcMode?: ImageProcMode;
  /** Detections below this confidence are dropped. Default 0.6, as in AR.js. */
  minConfidence?: number;
  /** Projection near plane. Default 0.01. */
  near?: number;
  /** Projection far plane. Default 1000. */
  far?: number;
  /** Smooth the frame when downscaling it for the detector. Default false, as in AR.js. */
  imageSmoothingEnabled?: boolean;
  /**
   * Rotate the calibration for portrait frames instead of stretching it.
   * Default true.
   */
  autoRotateCalibration?: boolean;
}

export type MarkerDescriptor =
  | { type: 'pattern'; url: string; size?: number }
  | { type: 'barcode'; value: number; size?: number };

/** A registered marker. `key` is stable for the lifetime of the tracker. */
export interface MarkerHandle {
  readonly key: string;
  readonly type: 'pattern' | 'barcode';
  readonly id: number;
  readonly size: number;
}

export interface DetectedMarker {
  handle: MarkerHandle;
  /**
   * Marker pose in camera space (three.js conventions), with Y normal to the
   * marker, as in AR.js. Reused between frames: copy it to keep it.
   */
  matrix: Matrix4;
  confidence: number;
}

export interface MarkerFrameResult {
  detected: DetectedMarker[];
  /** Handles visible in the previous processed frame and not in this one. */
  lost: MarkerHandle[];
}

/**
 * Releases the engine. `disposeARToolKitState` from artoolkit5-ts 0.3.0
 * aborts the WASM module: `core.delete()` runs a destructor that frees what
 * `teardown()` already freed. Each tracker owns its own module instance, so
 * calling only `teardown()` and letting the instance be garbage-collected is
 * safe. Remove this once fixed upstream.
 */
function releaseState(state: ARToolKitState): void {
  try {
    state.core.teardown();
  } catch {
    // The instance is discarded either way.
  }
}

async function loadWasmUrl(wasmUrl?: string): Promise<string> {
  if (wasmUrl) return wasmUrl;
  const mod = await import('../../assets/wasm.generated');
  return mod.default;
}

async function loadCameraUrl(
  url: string,
  portrait: boolean,
  rotate: boolean,
): Promise<{ url: string; revoke: () => void }> {
  if (!portrait || !rotate) return { url, revoke: () => undefined };
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const params = parseCameraParams(await response.arrayBuffer());
  if (params.height > params.width) return { url, revoke: () => undefined };
  const blob = new Blob([serializeCameraParams(rotateCameraParams(params))]);
  const rotated = URL.createObjectURL(blob);
  return { url: rotated, revoke: () => URL.revokeObjectURL(rotated) };
}

/**
 * ARToolKit marker detection for one source size. Equivalent to the AR.js
 * `ArToolkitContext` plus the detection half of `ArMarkerControls`.
 *
 * Create one per source resolution: when the frame size changes (a phone
 * rotating), dispose it and create another.
 */
export class MarkerTracker {
  readonly width: number;
  readonly height: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;

  #state: ARToolKitState;
  #canvas: OffscreenCanvas | HTMLCanvasElement;
  #ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  #patternIds = new Map<string, Promise<number>>();
  #byEngineKey = new Map<string, MarkerHandle>();
  #matrices = new Map<string, Matrix4>();
  #projection: Float64Array;
  #detectionMode: DetectionMode;
  #disposed = false;

  private constructor(
    state: ARToolKitState,
    sourceWidth: number,
    sourceHeight: number,
    imageSmoothingEnabled: boolean,
    detectionMode: DetectionMode,
  ) {
    this.#state = state;
    this.#detectionMode = detectionMode;
    this.width = state.width;
    this.height = state.height;
    this.sourceWidth = sourceWidth;
    this.sourceHeight = sourceHeight;
    this.#projection = getCameraProjectionMatrix(state);
    if (typeof OffscreenCanvas !== 'undefined') {
      this.#canvas = new OffscreenCanvas(this.width, this.height);
    } else {
      this.#canvas = document.createElement('canvas');
      this.#canvas.width = this.width;
      this.#canvas.height = this.height;
    }
    const ctx = this.#canvas.getContext('2d', { willReadFrequently: true }) as
      OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) throw new ArError('unsupported', 'A 2D canvas context is not available.');
    ctx.imageSmoothingEnabled = imageSmoothingEnabled;
    this.#ctx = ctx;
  }

  /** Loads the engine and calibration for frames of the given source size. */
  static async create(
    sourceWidth: number,
    sourceHeight: number,
    options: MarkerTrackerOptions = {},
  ): Promise<MarkerTracker> {
    const { width, height } = processingSize(
      sourceWidth,
      sourceHeight,
      options.maxProcessingSize ?? 640,
    );
    let camera: { url: string; revoke: () => void } | undefined;
    try {
      const wasmUrl = await loadWasmUrl(options.wasmUrl);
      camera = await loadCameraUrl(
        options.cameraParametersUrl ?? CAMERA_PARAMETERS_URL,
        height > width,
        options.autoRotateCalibration ?? true,
      );
      const state = await createARToolKitState(width, height, camera.url, wasmUrl);
      const detectionMode = options.detectionMode ?? 'mono_and_matrix';
      configureDetector(state, {
        detectionMode,
        matrixCodeType: options.matrixCodeType ?? '3x3',
        labelingMode: options.labelingMode ?? 'black_region',
        patternRatio: options.patternRatio ?? 0.5,
        ...(options.threshold !== undefined && { threshold: options.threshold }),
        ...(options.thresholdMode !== undefined && { thresholdMode: options.thresholdMode }),
        ...(options.imageProcMode !== undefined && { imageProcMode: options.imageProcMode }),
        nearPlane: options.near ?? 0.01,
        farPlane: options.far ?? 1000,
        minConfidence: {
          pattern: options.minConfidence ?? 0.6,
          barcode: options.minConfidence ?? 0.6,
        },
      });
      return new MarkerTracker(
        state,
        sourceWidth,
        sourceHeight,
        options.imageSmoothingEnabled ?? false,
        detectionMode,
      );
    } catch (error) {
      if (error instanceof ArError) throw error;
      throw new ArError(
        'engine-init-failed',
        `ARToolKit could not start: ${error instanceof Error ? error.message : String(error)}. ` +
          'If your bundler rewrites asset paths, pass `wasmUrl` and `cameraParametersUrl` explicitly.',
        { cause: error },
      );
    } finally {
      camera?.revoke();
    }
  }

  /**
   * The ARToolKit projection matrix for the full source frame (column-major).
   * Fit it to the view with `fitProjectionToView`.
   */
  get projectionMatrix(): Float64Array {
    return this.#projection;
  }

  /** Registers a marker. Registering the same marker twice returns the same handle. */
  async addMarker(marker: MarkerDescriptor): Promise<MarkerHandle> {
    this.#assertAlive();
    const size = marker.size ?? 1;
    let id: number;
    if (marker.type === 'pattern') {
      let pending = this.#patternIds.get(marker.url);
      if (!pending) {
        pending = loadPatternMarker(this.#state, marker.url);
        this.#patternIds.set(marker.url, pending);
      }
      try {
        id = await pending;
      } catch (error) {
        this.#patternIds.delete(marker.url);
        throw new ArError(
          'marker-load-failed',
          `Pattern marker could not be loaded: ${marker.url}`,
          {
            cause: error,
          },
        );
      }
      this.#assertAlive();
      trackMarker(this.#state, id, size);
    } else {
      id = marker.value;
      trackBarcodeMarker(this.#state, id, size);
    }
    // The engine keeps one width per marker, so the latest registration wins.
    const key = `${marker.type}:${id}`;
    const handle: MarkerHandle = { key, type: marker.type, id, size };
    this.#byEngineKey.set(key, handle);
    if (!this.#matrices.has(key)) this.#matrices.set(key, new Matrix4());
    return handle;
  }

  /**
   * Stops reporting a marker. The engine keeps the pattern loaded, so adding
   * it again is instant.
   */
  removeMarker(handle: MarkerHandle): void {
    this.#byEngineKey.delete(handle.key);
    this.#matrices.delete(handle.key);
  }

  /** Reads the current frame from `element` and detects markers in it. */
  process(element: SourceElement): MarkerFrameResult {
    this.#assertAlive();
    this.#ctx.drawImage(element, 0, 0, this.width, this.height);
    const pixels = this.#ctx.getImageData(0, 0, this.width, this.height).data;
    const result = processFrame(this.#state, pixels);

    const detected: DetectedMarker[] = [];
    for (const pose of result.detected) {
      const handle = this.#byEngineKey.get(`${pose.type}:${pose.id}`);
      if (!handle) continue;
      const matrix = this.#matrices.get(handle.key);
      if (!matrix) continue;
      engineToMarkerMatrix(pose, this.#detectionMode, matrix);
      detected.push({ handle, matrix, confidence: pose.confidence });
    }
    const lost: MarkerHandle[] = [];
    for (const marker of result.lost) {
      const handle = this.#byEngineKey.get(`${marker.type}:${marker.id}`);
      if (handle) lost.push(handle);
    }
    return { detected, lost };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    releaseState(this.#state);
    this.#byEngineKey.clear();
    this.#matrices.clear();
  }

  #assertAlive(): void {
    if (this.#disposed)
      throw new ArError('engine-init-failed', 'This MarkerTracker has been disposed.');
  }
}
