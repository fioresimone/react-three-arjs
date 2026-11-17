import { useFrame } from '@react-three/fiber';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ArError } from '../core/errors';
import {
  DeviceOrientationControls,
  orientationPermissionRequired,
  requestOrientationPermission,
  type DeviceOrientationControlsOptions,
} from '../core/location/device-orientation';
import {
  LocationBased,
  type GpsPosition,
  type LocationBasedOptions,
} from '../core/location/location-based';
import type { LonLat } from '../core/location/projection';
import { useARStore } from './store';

export interface SimulatedPosition {
  latitude: number;
  longitude: number;
  /** Metres. */
  altitude?: number;
}

export interface LocationTrackingProps extends LocationBasedOptions {
  children?: ReactNode;
  /**
   * Use a fixed position instead of the GPS (AR.js `simulateLatitude`,
   * `simulateLongitude`, `simulateAltitude`). Handy on desktop.
   */
  simulate?: SimulatedPosition;
  /**
   * Rotate the camera from the device compass and gyroscope. `false` turns it
   * off (e.g. to use OrbitControls on desktop). Default on.
   */
  orientation?: false | DeviceOrientationControlsOptions;
  onGpsUpdate?: (position: GpsPosition, distanceMoved: number) => void;
  onOriginSet?: (origin: LonLat) => void;
  onError?: (error: ArError) => void;
}

const LocationContext = createContext<LocationBased | null>(null);

/** The {@link LocationBased} instance of the enclosing `<LocationTracking>`. */
export function useLocationBased(): LocationBased {
  const lb = useContext(LocationContext);
  if (!lb) throw new Error('This component or hook must be used inside <LocationTracking>.');
  return lb;
}

/**
 * Location-based AR: positions the camera from the GPS and rotates it from
 * the device orientation. Place content with `<GpsPlace>`.
 *
 * Replaces AR.js `gps-new-camera`, `gps-camera`, `gps-projected-camera`,
 * `arjs-device-orientation-controls` and the three.js `LocationBased` API.
 */
export function LocationTracking({
  children,
  simulate,
  orientation = {},
  onGpsUpdate,
  onOriginSet,
  onError,
  ...options
}: LocationTrackingProps): ReactElement {
  const store = useARStore();
  const camera = store.camera;
  const callbacks = useRef({ onGpsUpdate, onOriginSet, onError });
  useLayoutEffect(() => {
    callbacks.current = { onGpsUpdate, onOriginSet, onError };
  });

  const optionsKey = JSON.stringify(options);
  // The constructor has no side effects; GPS starts in an effect below.
  const lb = useMemo(
    () => new LocationBased(camera, JSON.parse(optionsKey) as LocationBasedOptions),
    [camera, optionsKey],
  );

  useEffect(() => {
    const instance = lb;
    camera.position.set(0, 0, 0);
    const offs = [
      instance.on('gpsupdate', ({ position, distanceMoved }) => {
        store.setState({ gpsPosition: position });
        callbacks.current.onGpsUpdate?.(position, distanceMoved);
      }),
      instance.on('originset', (origin) => {
        store.setState({ gpsOrigin: origin });
        callbacks.current.onOriginSet?.(origin);
      }),
      instance.on('gpserror', (error) => {
        callbacks.current.onError?.(error);
        store.reportError(error);
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      instance.stopGps();
      store.setState({ gpsPosition: null, gpsOrigin: null });
    };
  }, [lb, camera, store]);

  // Real GPS, or a simulated fixed position.
  const simKey = simulate ? JSON.stringify(simulate) : null;
  useEffect(() => {
    if (simKey) {
      const sim = JSON.parse(simKey) as SimulatedPosition;
      lb.fakeGps(sim.longitude, sim.latitude, sim.altitude ?? null);
      return;
    }
    lb.startGps();
    return () => {
      lb.stopGps();
    };
  }, [lb, simKey]);

  // Device orientation, with the iOS permission flow.
  const controlsRef = useRef<DeviceOrientationControls | null>(null);
  const orientationKey = orientation === false ? null : JSON.stringify(orientation);
  useEffect(() => {
    if (orientationKey === null) {
      store.setState({ orientationPermission: 'unknown' });
      return;
    }
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      store.setState({ orientationPermission: 'unsupported' });
      return;
    }
    const controls = new DeviceOrientationControls(
      camera,
      JSON.parse(orientationKey) as DeviceOrientationControlsOptions,
    );
    controlsRef.current = controls;
    const start = (): void => {
      controls.connect();
      store.setState({ orientationPermission: 'granted' });
    };
    if (orientationPermissionRequired()) {
      store.setState({ orientationPermission: 'prompt' });
      store.requestOrientationPermission = async () => {
        try {
          await requestOrientationPermission();
          start();
        } catch (error) {
          const arError =
            error instanceof ArError
              ? error
              : new ArError('orientation-permission-denied', String(error), { cause: error });
          store.setState({ orientationPermission: 'denied' });
          callbacks.current.onError?.(arError);
          store.reportError(arError);
        }
      };
    } else {
      start();
    }
    return () => {
      controls.dispose();
      controlsRef.current = null;
      store.requestOrientationPermission = async () => undefined;
    };
  }, [camera, orientationKey, store]);

  useFrame(() => controlsRef.current?.update());

  return <LocationContext.Provider value={lb}>{children}</LocationContext.Provider>;
}
