import { useFrame } from '@react-three/fiber';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { Matrix4 } from 'three';
import { ArError } from '../core/errors';
import type { MarkerControls } from '../core/marker/marker-controls';
import {
  MarkerTracker,
  type MarkerDescriptor,
  type MarkerHandle,
  type MarkerTrackerOptions,
} from '../core/marker/marker-tracker';
import { useAR, useARStore } from './store';

interface Registration {
  descriptor: MarkerDescriptor;
  controls: MarkerControls;
  handle: MarkerHandle | null;
}

interface MarkerRegistry {
  register(descriptor: MarkerDescriptor, controls: MarkerControls): () => void;
}

const MarkerRegistryContext = createContext<MarkerRegistry | null>(null);

export function useMarkerRegistry(): MarkerRegistry {
  const registry = useContext(MarkerRegistryContext);
  if (!registry) throw new Error('<Marker> must be placed inside <MarkerTracking>.');
  return registry;
}

export interface MarkerTrackingProps extends MarkerTrackerOptions {
  children?: ReactNode;
  /** Maximum detections per second. Default 60, as in AR.js. */
  maxDetectionRate?: number;
  /** Called when the engine is loaded and markers can be detected. */
  onReady?: (tracker: MarkerTracker) => void;
  onError?: (error: ArError) => void;
}

/**
 * Runs ARToolKit marker detection on the `<ARCanvas>` source and drives every
 * `<Marker>` inside it. Applies the calibrated projection to the AR camera.
 *
 * Replaces the AR.js `ArToolkitContext` and the marker side of the `arjs`
 * A-Frame system.
 */
export function MarkerTracking({
  children,
  maxDetectionRate = 60,
  onReady,
  onError,
  ...options
}: MarkerTrackingProps): ReactElement {
  const store = useARStore();
  const source = useAR((s) => s.source);
  const sourceSize = useAR((s) => s.sourceSize);
  const [tracker, setTracker] = useState<MarkerTracker | null>(null);
  const registrations = useRef(new Set<Registration>());
  const trackerRef = useRef<MarkerTracker | null>(null);
  const callbacks = useRef({ onReady, onError });
  useLayoutEffect(() => {
    callbacks.current = { onReady, onError };
  });

  const optionsKey = JSON.stringify(options);
  const width = sourceSize?.width ?? 0;
  const height = sourceSize?.height ?? 0;

  // (Re)create the engine for the current frame size and options.
  useEffect(() => {
    if (!width || !height) return;
    const regs = registrations.current;
    let cancelled = false;
    let created: MarkerTracker | null = null;
    const opts = JSON.parse(optionsKey) as MarkerTrackerOptions;
    MarkerTracker.create(width, height, opts).then(
      async (t) => {
        if (cancelled) return t.dispose();
        created = t;
        // Register every marker already mounted before publishing the tracker.
        await Promise.all(
          [...registrations.current].map((r) => attach(t, r, store.reportError.bind(store))),
        );
        if (cancelled) return;
        trackerRef.current = t;
        setTracker(t);
        store.camera.arProjection = t.projectionMatrix;
        store.camera.sourceAspect = width / height;
        store.camera.updateProjectionMatrix();
        store.setState({ markerTrackingReady: true });
        callbacks.current.onReady?.(t);
      },
      (error: unknown) => {
        if (cancelled) return;
        const arError =
          error instanceof ArError
            ? error
            : new ArError('engine-init-failed', String(error), { cause: error });
        callbacks.current.onError?.(arError);
        store.reportError(arError);
      },
    );
    return () => {
      cancelled = true;
      for (const r of regs) {
        r.handle = null;
        r.controls.reset();
      }
      trackerRef.current = null;
      setTracker(null);
      created?.dispose();
      store.camera.arProjection = null;
      store.camera.updateProjectionMatrix();
      store.setState({ markerTrackingReady: false });
    };
  }, [width, height, optionsKey, store]);

  const [registry] = useState<MarkerRegistry>(() => ({
    register(descriptor, controls) {
      const registration: Registration = { descriptor, controls, handle: null };
      registrations.current.add(registration);
      const t = trackerRef.current;
      if (t) void attach(t, registration, store.reportError.bind(store));
      return () => {
        registrations.current.delete(registration);
        const handle = registration.handle;
        registration.handle = null;
        controls.reset();
        const stillUsed = [...registrations.current].some((r) => r.handle?.key === handle?.key);
        if (handle && !stillUsed) trackerRef.current?.removeMarker(handle);
      };
    },
  }));

  const lastDetection = useRef(0);
  const lastVideoTime = useRef(-1);
  useFrame(() => {
    if (!tracker || !source) return;
    const now = performance.now();
    if (now - lastDetection.current < 1000 / maxDetectionRate) return;
    const el = source.element;
    if (el instanceof HTMLVideoElement) {
      if (el.readyState < 2) return;
      // Only process frames the camera has actually delivered.
      if (el.currentTime === lastVideoTime.current && !el.paused) return;
      lastVideoTime.current = el.currentTime;
    }
    lastDetection.current = now;

    const result = tracker.process(el);
    const seen = new Map<string, { matrix: Matrix4; confidence: number }>();
    for (const d of result.detected) seen.set(d.handle.key, d);
    for (const r of registrations.current) {
      if (!r.handle) continue;
      const hit = seen.get(r.handle.key);
      r.controls.update(hit ? hit.matrix : null, now, hit?.confidence ?? 0);
    }
  });

  return (
    <MarkerRegistryContext.Provider value={registry}>{children}</MarkerRegistryContext.Provider>
  );
}

async function attach(
  tracker: MarkerTracker,
  registration: Registration,
  report: (error: ArError) => void,
): Promise<void> {
  try {
    registration.handle = await tracker.addMarker(registration.descriptor);
  } catch (error) {
    report(
      error instanceof ArError
        ? error
        : new ArError('marker-load-failed', String(error), { cause: error }),
    );
  }
}
