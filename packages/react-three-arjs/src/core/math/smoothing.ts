import { Quaternion, Vector3, type Matrix4 } from 'three';

/**
 * AR.js marker smoothing (`smooth`, `smoothCount`, `smoothTolerance`,
 * `smoothThreshold`): averages the last `count` matrices and holds still
 * until at least `threshold` entries move by more than `tolerance`.
 */
export interface AverageSmoothingOptions {
  type: 'average';
  /** Matrices averaged. Default 5. */
  count?: number;
  /** Per-entry distance from the average that counts as movement. Default 0.01. */
  tolerance?: number;
  /** Entries that must move before the pose updates. Default 2. */
  threshold?: number;
}

/**
 * AR.js `ArSmoothedControls`: exponential interpolation towards the detected
 * pose, made frame-rate independent here (AR.js stepped at a fixed 60 Hz).
 */
export interface LerpSmoothingOptions {
  type: 'lerp';
  /** Fraction of the remaining distance covered per 1/60 s. Default 0.8. */
  position?: number;
  /** Default 0.2. */
  quaternion?: number;
  /** Default 0.7. */
  scale?: number;
}

/**
 * One Euro filter (Casiez et al., 2012): strong smoothing when the marker is
 * still, little lag when it moves fast. New in this library; it removes
 * jitter without the "swimming" of a plain average.
 */
export interface OneEuroSmoothingOptions {
  type: 'one-euro';
  /** Minimum cutoff frequency in Hz. Lower is smoother when still. Default 1. */
  minCutoff?: number;
  /** Speed coefficient. Higher reduces lag when moving. Default 0.5. */
  beta?: number;
  /** Cutoff for the derivative, in Hz. Default 1. */
  derivativeCutoff?: number;
}

export type SmoothingOptions =
  AverageSmoothingOptions | LerpSmoothingOptions | OneEuroSmoothingOptions;

/** Smooths a stream of poses. */
export interface PoseSmoother {
  /**
   * Feeds the latest detected pose and writes the smoothed pose to `out`.
   * Returns false when the output did not change (the average smoother
   * holding still), true otherwise.
   */
  update(target: Matrix4, timeMs: number, out: Matrix4): boolean;
  /** Forgets history, e.g. when the marker is lost, so the next pose snaps. */
  reset(): void;
}

export function createSmoother(options: SmoothingOptions): PoseSmoother {
  switch (options.type) {
    case 'average':
      return new AverageSmoother(options);
    case 'lerp':
      return new LerpSmoother(options);
    case 'one-euro':
      return new OneEuroPoseSmoother(options);
  }
}

class AverageSmoother implements PoseSmoother {
  readonly #count: number;
  readonly #tolerance: number;
  readonly #threshold: number;
  #history: number[][] = [];

  constructor(options: AverageSmoothingOptions) {
    this.#count = Math.max(1, options.count ?? 5);
    this.#tolerance = options.tolerance ?? 0.01;
    this.#threshold = options.threshold ?? 2;
  }

  update(target: Matrix4, _timeMs: number, out: Matrix4): boolean {
    this.#history.push(target.elements.slice());
    if (this.#history.length < this.#count + 1) {
      out.copy(target);
      return true;
    }
    this.#history.shift();
    const averages = new Array<number>(16);
    let moving = 0;
    for (let i = 0; i < 16; i++) {
      let sum = 0;
      for (const m of this.#history) sum += m[i] ?? 0;
      const avg = sum / this.#count;
      averages[i] = avg;
      if (Math.abs(avg - (target.elements[i] ?? 0)) >= this.#tolerance) moving++;
    }
    if (moving < this.#threshold) return false;
    out.fromArray(averages);
    return true;
  }

  reset(): void {
    this.#history = [];
  }
}

const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();

class LerpSmoother implements PoseSmoother {
  readonly #position: number;
  readonly #quaternion: number;
  readonly #scale: number;
  #current: { p: Vector3; q: Quaternion; s: Vector3 } | null = null;
  #lastTime = 0;

  constructor(options: LerpSmoothingOptions) {
    this.#position = options.position ?? 0.8;
    this.#quaternion = options.quaternion ?? 0.2;
    this.#scale = options.scale ?? 0.7;
  }

  update(target: Matrix4, timeMs: number, out: Matrix4): boolean {
    target.decompose(_p, _q, _s);
    if (!this.#current) {
      this.#current = { p: _p.clone(), q: _q.clone(), s: _s.clone() };
    } else {
      const steps = Math.max(0, (timeMs - this.#lastTime) / (1000 / 60));
      const k = (f: number): number => 1 - Math.pow(1 - f, steps);
      this.#current.p.lerp(_p, k(this.#position));
      this.#current.q.slerp(_q, k(this.#quaternion));
      this.#current.s.lerp(_s, k(this.#scale));
    }
    this.#lastTime = timeMs;
    out.compose(this.#current.p, this.#current.q, this.#current.s);
    return true;
  }

  reset(): void {
    this.#current = null;
  }
}

/** Scalar One Euro filter. */
export class OneEuroFilter {
  minCutoff: number;
  beta: number;
  derivativeCutoff: number;
  #x: number | null = null;
  #dx = 0;
  #lastTime = 0;

  constructor(minCutoff = 1, beta = 0.5, derivativeCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
  }

  filter(value: number, timeMs: number): number {
    if (this.#x === null) {
      this.#x = value;
      this.#lastTime = timeMs;
      return value;
    }
    const dt = Math.max(1e-3, (timeMs - this.#lastTime) / 1000);
    this.#lastTime = timeMs;
    const alpha = (cutoff: number): number => {
      const tau = 1 / (2 * Math.PI * cutoff);
      return 1 / (1 + tau / dt);
    };
    const dx = (value - this.#x) / dt;
    const ad = alpha(this.derivativeCutoff);
    this.#dx = ad * dx + (1 - ad) * this.#dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.#dx);
    const a = alpha(cutoff);
    this.#x = a * value + (1 - a) * this.#x;
    return this.#x;
  }

  reset(): void {
    this.#x = null;
    this.#dx = 0;
  }
}

class OneEuroPoseSmoother implements PoseSmoother {
  readonly #filters: OneEuroFilter[];
  readonly #lastQ = new Quaternion();
  #hasLast = false;

  constructor(options: OneEuroSmoothingOptions) {
    const { minCutoff = 1, beta = 0.5, derivativeCutoff = 1 } = options;
    // 3 position + 4 quaternion + 3 scale components.
    this.#filters = Array.from(
      { length: 10 },
      () => new OneEuroFilter(minCutoff, beta, derivativeCutoff),
    );
  }

  update(target: Matrix4, timeMs: number, out: Matrix4): boolean {
    target.decompose(_p, _q, _s);
    // q and -q are the same rotation; keep the hemisphere continuous so the
    // per-component filter never averages across a sign flip.
    if (this.#hasLast && this.#lastQ.dot(_q) < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
    const f = this.#filters as [OneEuroFilter, ...OneEuroFilter[]];
    const v = [_p.x, _p.y, _p.z, _q.x, _q.y, _q.z, _q.w, _s.x, _s.y, _s.z].map((x, i) =>
      (f[i] as OneEuroFilter).filter(x, timeMs),
    ) as [number, number, number, number, number, number, number, number, number, number];
    _p.set(v[0], v[1], v[2]);
    _q.set(v[3], v[4], v[5], v[6]).normalize();
    _s.set(v[7], v[8], v[9]);
    this.#lastQ.copy(_q);
    this.#hasLast = true;
    out.compose(_p, _q, _s);
    return true;
  }

  reset(): void {
    for (const f of this.#filters) f.reset();
    this.#hasLast = false;
  }
}

/**
 * Debounces marker visibility, like `minVisibleDelay` / `minUnvisibleDelay`
 * in AR.js `ArSmoothedControls`: a marker must be seen for `foundDelay` ms
 * before it counts as found, and missing for `lostDelay` ms before it counts
 * as lost. Removes flicker when detection drops single frames.
 */
export class VisibilityFilter {
  foundDelay: number;
  lostDelay: number;
  #visible = false;
  #changeStartedAt: number | null = null;

  constructor(foundDelay = 0, lostDelay = 0) {
    this.foundDelay = foundDelay;
    this.lostDelay = lostDelay;
  }

  get visible(): boolean {
    return this.#visible;
  }

  /** Feeds the raw detection state; returns the debounced state. */
  update(detected: boolean, timeMs: number): boolean {
    if (detected === this.#visible) {
      this.#changeStartedAt = null;
      return this.#visible;
    }
    this.#changeStartedAt ??= timeMs;
    const delay = detected ? this.foundDelay : this.lostDelay;
    if (timeMs - this.#changeStartedAt >= delay) {
      this.#visible = detected;
      this.#changeStartedAt = null;
    }
    return this.#visible;
  }

  reset(): void {
    this.#visible = false;
    this.#changeStartedAt = null;
  }
}
