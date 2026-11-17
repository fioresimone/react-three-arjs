import type { ThreeElements } from '@react-three/fiber';
import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import type { Group } from 'three';
import { haversineDistance } from '../core/location/projection';
import { useLocationBased } from './LocationTracking';
import { useAR } from './store';

export type GpsPlaceProps = Omit<ThreeElements['group'], 'ref' | 'children' | 'position'> & {
  children?: ReactNode;
  ref?: Ref<Group>;
  latitude: number;
  longitude: number;
  /** Height in metres. Leave unset to keep the content at camera-relative height 0. */
  altitude?: number;
  /** Hide the content when closer than this many metres (AR.js `gps-camera minDistance`). */
  minDistance?: number;
  /** Hide the content when further than this many metres (AR.js `gps-camera maxDistance`). */
  maxDistance?: number;
  /** Called with the distance in metres whenever the GPS position changes. */
  onDistanceChange?: (metres: number) => void;
};

/**
 * Content placed at a real-world coordinate. Replaces AR.js
 * `gps-new-entity-place`, `gps-entity-place` and `gps-projected-entity-place`.
 *
 * ```tsx
 * <GpsPlace latitude={51.0596} longitude={-0.7170}>
 *   <mesh><boxGeometry args={[10, 10, 10]} /></mesh>
 * </GpsPlace>
 * ```
 */
export function GpsPlace({
  ref,
  children,
  latitude,
  longitude,
  altitude,
  minDistance,
  maxDistance,
  onDistanceChange,
  ...groupProps
}: GpsPlaceProps): ReactElement {
  const lb = useLocationBased();
  const origin = useAR((s) => s.gpsOrigin);
  const gps = useAR((s) => s.gpsPosition);
  const group = useRef<Group>(null);
  useImperativeHandle(ref, () => group.current as Group, []);
  const onDistance = useRef(onDistanceChange);
  useLayoutEffect(() => {
    onDistance.current = onDistanceChange;
  });

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    if (!lb.ready) {
      g.visible = false;
      return;
    }
    lb.setWorldPosition(g, longitude, latitude, altitude);

    let visible = true;
    if (gps) {
      const d = haversineDistance(gps, { longitude, latitude });
      if (minDistance !== undefined && d < minDistance) visible = false;
      if (maxDistance !== undefined && d > maxDistance) visible = false;
      onDistance.current?.(d);
    }
    g.visible = visible;
  }, [lb, origin, gps, latitude, longitude, altitude, minDistance, maxDistance]);

  return (
    <group ref={group} {...groupProps}>
      {children}
    </group>
  );
}

/**
 * Distance in metres from the current GPS position to a point, or null
 * before the first fix. Updates with every GPS update (AR.js
 * `gps-new-entity-place` `distance` property).
 */
export function useGpsDistance(latitude: number, longitude: number): number | null {
  return useAR((s) =>
    s.gpsPosition ? haversineDistance(s.gpsPosition, { longitude, latitude }) : null,
  );
}
