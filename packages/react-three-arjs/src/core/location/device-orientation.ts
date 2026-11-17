import { Euler, MathUtils, Quaternion, Vector3, type Object3D } from 'three';
import { Emitter } from '../emitter';
import { ArError } from '../errors';

const Z_AXIS = new Vector3(0, 0, 1);
const _euler = new Euler();
const _q0 = new Quaternion();
// -90 degrees around X: the camera looks out of the back of the device.
const _q1 = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

interface OrientationReading {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
  /** iOS only: degrees clockwise from magnetic north. */
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

type PermissionedDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/** Whether the browser requires a user gesture to read the compass (iOS 13+). */
export function orientationPermissionRequired(): boolean {
  return (
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof (DeviceOrientationEvent as PermissionedDeviceOrientationEvent).requestPermission ===
      'function'
  );
}

/**
 * Asks for device-orientation permission. On iOS this must be called from a
 * user gesture (a tap handler). Resolves immediately elsewhere.
 */
export async function requestOrientationPermission(): Promise<void> {
  if (!orientationPermissionRequired()) return;
  const result = await (DeviceOrientationEvent as PermissionedDeviceOrientationEvent)
    .requestPermission!();
  if (result !== 'granted') {
    throw new ArError('orientation-permission-denied', 'Motion and orientation access was denied.');
  }
}

export interface DeviceOrientationControlsOptions {
  /**
   * 1 = no smoothing; lower values smooth more (AR.js `smoothingFactor`).
   * Default 1.
   */
  smoothingFactor?: number;
  /**
   * Align the heading to true compass north using iOS `webkitCompassHeading`
   * (iOS reports a relative `alpha`). Default true. AR.js issue #466.
   */
  compassHeadingCorrection?: boolean;
  /**
   * Low-pass factor for the iOS compass correction, 0..1. Lower is steadier.
   * Default 0.05.
   */
  compassCorrectionSmoothing?: number;
}

export interface DeviceOrientationControlsEvents {
  [key: string]: unknown;
  change: undefined;
}

/**
 * Rotates an object (the camera) from the device's orientation sensors.
 * A typed port of the AR.js fork of three.js `DeviceOrientationControls`:
 * prefers `deviceorientationabsolute` (true north on Android), supports
 * `smoothingFactor`, and adds iOS compass correction and a manual
 * {@link headingOffset} for user calibration.
 *
 * Call {@link connect} after permission is granted, and {@link update} every frame.
 */
export class DeviceOrientationControls extends Emitter<DeviceOrientationControlsEvents> {
  readonly object: Object3D;
  enabled = false;
  smoothingFactor: number;
  compassHeadingCorrection: boolean;
  compassCorrectionSmoothing: number;
  /** Extra rotation around the vertical axis, in radians, for manual calibration. */
  headingOffset = 0;

  #reading: OrientationReading | null = null;
  #screenAngle = 0;
  #last: { alpha: number; beta: number; gamma: number } | null = null;
  #lastQuaternion = new Quaternion();
  #compassOffset: number | null = null;
  readonly #eventName: 'deviceorientationabsolute' | 'deviceorientation';

  constructor(object: Object3D, options: DeviceOrientationControlsOptions = {}) {
    super();
    this.object = object;
    this.object.rotation.reorder('YXZ');
    this.smoothingFactor = options.smoothingFactor ?? 1;
    this.compassHeadingCorrection = options.compassHeadingCorrection ?? true;
    this.compassCorrectionSmoothing = options.compassCorrectionSmoothing ?? 0.05;
    this.#eventName =
      typeof window !== 'undefined' && 'ondeviceorientationabsolute' in window
        ? 'deviceorientationabsolute'
        : 'deviceorientation';
  }

  /** Whether any orientation event has arrived. */
  get hasReading(): boolean {
    return this.#reading !== null;
  }

  /** The current compass heading in degrees clockwise from north, if known. */
  get heading(): number | null {
    if (!this.#reading || this.#reading.alpha === null) return null;
    const alpha = this.#reading.alpha + MathUtils.radToDeg(this.#alphaOffset());
    return (((360 - alpha) % 360) + 360) % 360;
  }

  connect(): void {
    if (this.enabled) return;
    this.#onScreenOrientation();
    window.addEventListener(this.#eventName, this.#onDeviceOrientation as EventListener);
    screen.orientation?.addEventListener('change', this.#onScreenOrientation);
    window.addEventListener('orientationchange', this.#onScreenOrientation);
    this.enabled = true;
  }

  disconnect(): void {
    window.removeEventListener(this.#eventName, this.#onDeviceOrientation as EventListener);
    screen.orientation?.removeEventListener('change', this.#onScreenOrientation);
    window.removeEventListener('orientationchange', this.#onScreenOrientation);
    this.enabled = false;
  }

  dispose(): void {
    this.disconnect();
    this.removeAllListeners();
  }

  update(): void {
    if (!this.enabled || !this.#reading) return;
    const r = this.#reading;
    let alpha = r.alpha !== null ? MathUtils.degToRad(r.alpha) + this.#alphaOffset() : 0;
    let beta = r.beta !== null ? MathUtils.degToRad(r.beta) : 0;
    let gamma = r.gamma !== null ? MathUtils.degToRad(r.gamma) : 0;
    const orient = MathUtils.degToRad(this.#screenAngle);

    if (this.smoothingFactor < 1) {
      // Shift beta and gamma into positive ranges so the wrap-around maths
      // works, as the AR.js implementation does.
      beta += Math.PI;
      gamma += HALF_PI;
      if (this.#last) {
        const k = this.smoothingFactor;
        alpha = smoothAngle(alpha, this.#last.alpha, k);
        beta = smoothAngle(beta, this.#last.beta, k);
        gamma = smoothAngle(gamma, this.#last.gamma, k, Math.PI);
      }
      this.#last = { alpha, beta, gamma };
      beta -= Math.PI;
      gamma -= HALF_PI;
    }

    const q = this.object.quaternion;
    _euler.set(beta, alpha, -gamma, 'YXZ');
    q.setFromEuler(_euler);
    q.multiply(_q1);
    q.multiply(_q0.setFromAxisAngle(Z_AXIS, -orient));

    if (8 * (1 - this.#lastQuaternion.dot(q)) > 1e-6) {
      this.#lastQuaternion.copy(q);
      this.emit('change', undefined);
    }
  }

  #alphaOffset(): number {
    return this.headingOffset + (this.#compassOffset ?? 0);
  }

  #onScreenOrientation = (): void => {
    const legacy = (window as { orientation?: number }).orientation;
    this.#screenAngle = screen.orientation?.angle ?? legacy ?? 0;
  };

  #onDeviceOrientation = (event: DeviceOrientationEvent & OrientationReading): void => {
    this.#reading = {
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
      absolute: event.absolute,
    };
    const heading = event.webkitCompassHeading;
    if (
      this.compassHeadingCorrection &&
      !event.absolute &&
      typeof heading === 'number' &&
      event.alpha !== null &&
      (event.webkitCompassAccuracy ?? 0) >= 0
    ) {
      // On iOS alpha is relative to an arbitrary start; webkitCompassHeading
      // is clockwise from north while alpha is counter-clockwise.
      const target = MathUtils.degToRad(wrapDegrees(360 - heading - event.alpha));
      if (this.#compassOffset === null) this.#compassOffset = target;
      else {
        const diff = Math.atan2(
          Math.sin(target - this.#compassOffset),
          Math.cos(target - this.#compassOffset),
        );
        this.#compassOffset += diff * this.compassCorrectionSmoothing;
      }
    }
  };
}

function wrapDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Interpolates between two angles across the wrap-around (AR.js `_getSmoothedAngle`). */
export function smoothAngle(a: number, b: number, k: number, range: number = TWO_PI): number {
  const ordered =
    (b > a && Math.abs(b - a) < range / 2) || (a > b && Math.abs(b - a) > range / 2)
      ? { left: a, right: b }
      : { left: b, right: a };
  const shift = ordered.left;
  const originalRight = ordered.right;
  let right = ordered.right - shift;
  if (right < 0) right += range;
  let result = originalRight === b ? (1 - k) * right : k * right;
  result += shift;
  if (result >= range) result -= range;
  return result;
}
