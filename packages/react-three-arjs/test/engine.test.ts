/**
 * Runs the real ARToolKit WebAssembly engine on synthetic frames containing
 * printed markers, and checks the pose conventions this library relies on.
 */
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
} from '@ar-js-org/artoolkit5-ts';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMERA_PARAMETERS_URL, HIRO_PATTERN_URL } from '../src/assets/inline.generated';
import WASM_URL from '../src/assets/wasm.generated';
import {
  parseCameraParams,
  rotateCameraParams,
  serializeCameraParams,
} from '../src/core/math/camera-params';
import { engineToMarkerMatrix } from '../src/core/marker/pose';

const W = 640;
const H = 480;

const states: ARToolKitState[] = [];
afterEach(() => {
  // `disposeARToolKitState` aborts the module (see releaseState in marker-tracker.ts).
  for (const s of states.splice(0)) s.core.teardown();
});

/**
 * The WASM build targets browsers only: it refuses to start when it sees
 * `process.versions.node` or no `window`. Pretend to be a browser while it
 * initialises.
 */
async function createState(
  detectionMode: DetectionMode,
  { width = W, height = H, cameraUrl = CAMERA_PARAMETERS_URL } = {},
): Promise<ARToolKitState> {
  vi.stubGlobal('process', { ...globalThis.process, versions: {} });
  vi.stubGlobal('window', globalThis);
  try {
    const state = await createARToolKitState(width, height, cameraUrl, WASM_URL);
    states.push(state);
    configureDetector(state, { detectionMode, matrixCodeType: '3x3' });
    return state;
  } finally {
    vi.unstubAllGlobals();
  }
}

function loadPng(name: string): PNG {
  return PNG.sync.read(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
}

/**
 * White frame with a marker image centred, `quarterTurns` × 90° clockwise,
 * nearest-neighbour scaled to `size` pixels.
 */
function frame(
  image: PNG,
  { quarterTurns = 0, size = 240, width = W, height = H } = {},
): Uint8ClampedArray {
  const channels = image.data.length / (image.width * image.height);
  const out = new Uint8ClampedArray(width * height * 4).fill(255);
  const x0 = Math.floor((width - size) / 2);
  const y0 = Math.floor((height - size) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let u = x;
      let v = y;
      for (let r = 0; r < quarterTurns; r++) [u, v] = [v, size - 1 - u];
      const si =
        (Math.floor((v / size) * image.height) * image.width +
          Math.floor((u / size) * image.width)) *
        channels;
      const a = channels === 4 ? (image.data[si + 3] ?? 255) / 255 : 1;
      const di = ((y0 + y) * width + (x0 + x)) * 4;
      for (let c = 0; c < 3; c++) out[di + c] = (image.data[si + c] ?? 255) * a + 255 * (1 - a);
    }
  }
  return out;
}

const hiro = loadPng('hiro.png');
const barcode5 = loadPng('barcode-3x3-5.png');

const axis = (m: Matrix4, x: number, y: number, z: number): Vector3 =>
  new Vector3(x, y, z).transformDirection(m);

describe('ARToolKit engine (integration)', () => {
  it('Hiro: pose follows the AR.js conventions', async () => {
    const state = await createState('mono');
    const id = await loadPatternMarker(state, HIRO_PATTERN_URL);
    trackMarker(state, id, 1);
    const [pose] = processFrame(state, frame(hiro)).detected;
    expect(pose).toBeDefined();
    expect(pose!.confidence).toBeGreaterThan(0.6);

    const m = engineToMarkerMatrix(pose!, 'mono');
    const position = new Vector3().setFromMatrixPosition(m);
    // In front of a camera looking down -Z, centred.
    expect(position.z).toBeLessThan(0);
    expect(Math.abs(position.x / position.z)).toBeLessThan(0.05);
    expect(Math.abs(position.y / position.z)).toBeLessThan(0.05);
    // Values measured with the original AR.js on the same image:
    // X right, Y (normal) towards the camera, Z towards the marker's bottom edge.
    expect(axis(m, 1, 0, 0).x).toBeGreaterThan(0.99);
    expect(axis(m, 0, 1, 0).z).toBeGreaterThan(0.99);
    expect(axis(m, 0, 0, 1).y).toBeLessThan(-0.99);

    // The projection maps the marker centre back to the image centre.
    const ndc = position.applyMatrix4(new Matrix4().fromArray(getCameraProjectionMatrix(state)));
    expect(Math.abs(ndc.x)).toBeLessThan(0.05);
    expect(Math.abs(ndc.y)).toBeLessThan(0.05);
  });

  it.each([0, 1, 2, 3])(
    'Hiro rotated %i quarter turns: combined mode matches pattern-only mode',
    async (quarterTurns) => {
      const mono = await createState('mono');
      const combined = await createState('mono_and_matrix');
      for (const s of [mono, combined])
        trackMarker(s, await loadPatternMarker(s, HIRO_PATTERN_URL), 1);
      const image = frame(hiro, { quarterTurns });
      const [a] = processFrame(mono, image).detected;
      const [b] = processFrame(combined, image).detected;
      const qa = new Quaternion().setFromRotationMatrix(engineToMarkerMatrix(a!, 'mono'));
      const qb = new Quaternion().setFromRotationMatrix(
        engineToMarkerMatrix(b!, 'mono_and_matrix'),
      );
      expect(Math.abs(qa.dot(qb))).toBeGreaterThan(0.9999);
      // And the marker's X axis turns with the image (clockwise on screen).
      const x = axis(engineToMarkerMatrix(b!, 'mono_and_matrix'), 1, 0, 0);
      const expected = [
        [1, 0],
        [0, -1],
        [-1, 0],
        [0, 1],
      ][quarterTurns]!;
      expect(x.x).toBeCloseTo(expected[0]!, 1);
      expect(x.y).toBeCloseTo(expected[1]!, 1);
    },
  );

  it.each(['matrix', 'mono_and_matrix'] as const)(
    'detects barcode 5 (3x3) in %s mode',
    async (mode) => {
      const state = await createState(mode);
      trackBarcodeMarker(state, 5, 1);
      const [pose] = processFrame(state, frame(barcode5)).detected;
      expect(pose).toMatchObject({ type: 'barcode', id: 5 });
      const m = engineToMarkerMatrix(pose!, mode);
      expect(axis(m, 0, 1, 0).z).toBeGreaterThan(0.99);
      expect(axis(m, 1, 0, 0).x).toBeGreaterThan(0.99);
    },
  );

  it('reports a lost marker once it leaves the frame', async () => {
    const state = await createState('mono');
    const id = await loadPatternMarker(state, HIRO_PATTERN_URL);
    trackMarker(state, id, 1);
    expect(processFrame(state, frame(hiro)).detected).toHaveLength(1);
    const { detected, lost } = processFrame(state, new Uint8ClampedArray(W * H * 4).fill(255));
    expect(detected).toHaveLength(0);
    expect(lost).toEqual([{ id, type: 'pattern' }]);
  });

  it('tracks a portrait frame with the rotated calibration', async () => {
    const original = Buffer.from(CAMERA_PARAMETERS_URL.split(',')[1]!, 'base64');
    const params = parseCameraParams(
      original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength),
    );
    const rotated = Buffer.from(serializeCameraParams(rotateCameraParams(params)));
    const state = await createState('mono', {
      width: H,
      height: W,
      cameraUrl: `data:application/octet-stream;base64,${rotated.toString('base64')}`,
    });
    const id = await loadPatternMarker(state, HIRO_PATTERN_URL);
    trackMarker(state, id, 1);
    const [pose] = processFrame(state, frame(hiro, { width: H, height: W })).detected;
    expect(pose).toBeDefined();
    const position = new Vector3().setFromMatrixPosition(engineToMarkerMatrix(pose!, 'mono'));
    const ndc = position.applyMatrix4(new Matrix4().fromArray(getCameraProjectionMatrix(state)));
    expect(Math.abs(ndc.x)).toBeLessThan(0.05);
    expect(Math.abs(ndc.y)).toBeLessThan(0.05);
  });
});
