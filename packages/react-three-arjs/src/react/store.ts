import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ArError } from '../core/errors';
import type { GpsPosition } from '../core/location/location-based';
import type { LonLat } from '../core/location/projection';
import type { ArSource } from '../core/source/source';
import type { ARCamera } from './ar-camera';

export type SourceStatus = 'idle' | 'loading' | 'ready' | 'error';
export type OrientationPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface ARState {
  /** Camera, video or image source. */
  sourceStatus: SourceStatus;
  source: ArSource | null;
  /** Intrinsic source size; changes when a phone rotates. */
  sourceSize: { width: number; height: number } | null;
  /** The latest error from any part of the AR pipeline. */
  error: ArError | null;
  /** `true` once the marker engine is loaded (inside `<MarkerTracking>`). */
  markerTrackingReady: boolean;
  /** Last accepted GPS position (inside `<LocationTracking>`). */
  gpsPosition: GpsPosition | null;
  /** World origin for location-based AR. */
  gpsOrigin: LonLat | null;
  orientationPermission: OrientationPermission;
}

const initialState: ARState = {
  sourceStatus: 'idle',
  source: null,
  sourceSize: null,
  error: null,
  markerTrackingReady: false,
  gpsPosition: null,
  gpsOrigin: null,
  orientationPermission: 'unknown',
};

/** Small external store shared by the DOM and the R3F trees of one `<ARCanvas>`. */
export class ARStore {
  #state: ARState = initialState;
  #listeners = new Set<() => void>();
  readonly camera: ARCamera;
  /** Set by `<LocationTracking>`; must be called from a user gesture on iOS. */
  requestOrientationPermission: () => Promise<void> = async () => undefined;
  onError: ((error: ArError) => void) | undefined;

  constructor(camera: ARCamera) {
    this.camera = camera;
  }

  getState = (): ARState => this.#state;

  setState(partial: Partial<ARState>): void {
    let changed = false;
    for (const key of Object.keys(partial) as (keyof ARState)[]) {
      if (this.#state[key] !== partial[key]) changed = true;
    }
    if (!changed) return;
    this.#state = { ...this.#state, ...partial };
    for (const l of this.#listeners) l();
  }

  reportError(error: ArError): void {
    this.setState({ error });
    this.onError?.(error);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
}

export const ARStoreContext: React.Context<ARStore | null> = createContext<ARStore | null>(null);

export function useARStore(): ARStore {
  const store = useContext(ARStoreContext);
  if (!store) throw new Error('This component or hook must be used inside <ARCanvas>.');
  return store;
}

/**
 * Reads AR state. Works both inside the 3D scene and in DOM overlays passed
 * to `<ARCanvas overlay>`. Pass a selector to re-render only when that slice
 * changes.
 */
export function useAR(): ARState & { requestOrientationPermission: () => Promise<void> };
export function useAR<T>(selector: (state: ARState) => T): T;
export function useAR<T>(selector?: (state: ARState) => T): unknown {
  const store = useARStore();
  const state = useSyncExternalStore(
    store.subscribe,
    () => (selector ? selector(store.getState()) : store.getState()),
    () => (selector ? selector(store.getState()) : store.getState()),
  );
  if (selector) return state;
  return {
    ...(state as ARState),
    requestOrientationPermission: store.requestOrientationPermission,
  };
}
