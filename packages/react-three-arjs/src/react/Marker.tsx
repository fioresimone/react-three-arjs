import { useThree, type ThreeElements } from '@react-three/fiber';
import {
  createContext,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import type { Group, Matrix4 } from 'three';
import { HIRO_PATTERN_URL, KANJI_PATTERN_URL } from '../assets/inline.generated';
import { MarkerControls, type ChangeMatrixMode } from '../core/marker/marker-controls';
import type { MarkerDescriptor } from '../core/marker/marker-tracker';
import type { SmoothingOptions } from '../core/math/smoothing';
import { useMarkerRegistry } from './MarkerTracking';

/** Which marker to track. */
export type MarkerTarget =
  /** A built-in AR.js pattern. */
  | { preset: 'hiro' | 'kanji'; type?: never; url?: never; value?: never }
  /** A `.patt` pattern file, as made by the AR.js marker generator. */
  | { type: 'pattern'; url: string; preset?: never; value?: never }
  /** A barcode (matrix code) marker; pick the dictionary on `<MarkerTracking matrixCodeType>`. */
  | { type: 'barcode'; value: number; preset?: never; url?: never };

export interface MarkerEventInfo {
  confidence: number;
}

export type MarkerProps = MarkerTarget &
  // The group's transform is driven by the tracker: offset content by
  // transforming its children instead.
  Omit<
    ThreeElements['group'],
    'ref' | 'children' | 'type' | 'position' | 'rotation' | 'quaternion' | 'scale' | 'matrix'
  > & {
    children?: ReactNode;
    /** The group holding the marker content. */
    ref?: Ref<Group>;
    /** Physical marker width, in scene units. Default 1. */
    size?: number;
    /**
     * `'modelViewMatrix'` (default) moves this marker's content; with
     * `'cameraTransformMatrix'` the content stays at the origin and the
     * camera moves (AR.js `<a-marker-camera>`).
     */
    changeMatrixMode?: ChangeMatrixMode;
    /**
     * Pose smoothing. `true` uses the AR.js average smoothing with its
     * defaults; pass options for `'average'`, `'lerp'` or `'one-euro'`.
     */
    smoothing?: boolean | SmoothingOptions;
    /** ms the marker must be seen before it appears. Default 0. */
    foundDelay?: number;
    /** ms the marker must be missing before it disappears. Default 0. */
    lostDelay?: number;
    /** Keep the content visible (at its last pose) after the marker is lost. Default false. */
    keepVisibleWhenLost?: boolean;
    onFound?: (info: MarkerEventInfo) => void;
    onLost?: () => void;
    /** Called on every processed frame in which the marker is visible. */
    onUpdate?: (matrix: Matrix4, info: MarkerEventInfo) => void;
  };

interface MarkerContextValue {
  controls: MarkerControls;
  size: number;
}

const MarkerContext = createContext<MarkerContextValue | null>(null);

/** Inside a `<Marker>`: whether it is currently visible. Re-renders only on found/lost. */
export function useMarkerVisible(): boolean {
  const ctx = useContext(MarkerContext);
  if (!ctx) throw new Error('useMarkerVisible must be used inside <Marker>.');
  const [visible, setVisible] = useState(ctx.controls.visible);
  useEffect(() => {
    const offFound = ctx.controls.on('found', () => setVisible(true));
    const offLost = ctx.controls.on('lost', () => setVisible(false));
    return () => {
      offFound();
      offLost();
    };
  }, [ctx.controls]);
  return visible;
}

/** Inside a `<Marker>`: its size, for content that should match the marker. */
export function useMarkerSize(): number {
  const ctx = useContext(MarkerContext);
  if (!ctx) throw new Error('useMarkerSize must be used inside <Marker>.');
  return ctx.size;
}

function descriptorOf(target: MarkerTarget, size: number): MarkerDescriptor {
  if (target.preset) {
    return {
      type: 'pattern',
      url: target.preset === 'kanji' ? KANJI_PATTERN_URL : HIRO_PATTERN_URL,
      size,
    };
  }
  if (target.type === 'barcode') return { type: 'barcode', value: target.value, size };
  return { type: 'pattern', url: target.url, size };
}

/**
 * Content anchored to a printed marker. Replaces AR.js `<a-marker>`,
 * `<a-marker-camera>` and `ArMarkerControls`.
 *
 * ```tsx
 * <Marker preset="hiro" smoothing onFound={() => console.log('found')}>
 *   <mesh position-y={0.5}><boxGeometry /></mesh>
 * </Marker>
 * ```
 */
export function Marker(props: MarkerProps): ReactElement {
  const {
    ref,
    preset,
    type,
    url,
    value,
    children,
    size = 1,
    changeMatrixMode = 'modelViewMatrix',
    smoothing = false,
    foundDelay = 0,
    lostDelay = 0,
    keepVisibleWhenLost = false,
    onFound,
    onLost,
    onUpdate,
    ...groupProps
  } = props;
  const registry = useMarkerRegistry();
  const camera = useThree((s) => s.camera);
  const group = useRef<Group>(null);
  useImperativeHandle(ref, () => group.current as Group, []);

  const callbacks = useRef({ onFound, onLost, onUpdate });
  useLayoutEffect(() => {
    callbacks.current = { onFound, onLost, onUpdate };
  });

  const smoothingKey = JSON.stringify(smoothing);
  const controls = useMemo(() => {
    const s = JSON.parse(smoothingKey) as boolean | SmoothingOptions;
    return new MarkerControls({
      changeMatrixMode,
      smoothing: s === true ? { type: 'average' } : s,
      foundDelay,
      lostDelay,
    });
  }, [changeMatrixMode, smoothingKey, foundDelay, lostDelay]);

  const descriptorKey = JSON.stringify(
    descriptorOf({ preset, type, url, value } as MarkerTarget, size),
  );

  // Apply poses and visibility to the scene graph.
  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    const cameraMode = changeMatrixMode === 'cameraTransformMatrix';
    const target = cameraMode ? camera : g;
    const previousAutoUpdate = target.matrixAutoUpdate;
    target.matrixAutoUpdate = false;
    g.visible = false;

    const offUpdate = controls.on('update', ({ matrix, confidence }) => {
      target.matrix.copy(matrix);
      target.matrix.decompose(target.position, target.quaternion, target.scale);
      target.matrixWorldNeedsUpdate = true;
      callbacks.current.onUpdate?.(matrix, { confidence });
    });
    const offFound = controls.on('found', (info) => {
      g.visible = true;
      callbacks.current.onFound?.(info);
    });
    const offLost = controls.on('lost', () => {
      if (!keepVisibleWhenLost) g.visible = false;
      callbacks.current.onLost?.();
    });
    return () => {
      offUpdate();
      offFound();
      offLost();
      target.matrixAutoUpdate = previousAutoUpdate;
      if (cameraMode) {
        camera.position.set(0, 0, 0);
        camera.quaternion.identity();
        camera.updateMatrix();
      }
    };
  }, [controls, camera, changeMatrixMode, keepVisibleWhenLost]);

  useEffect(() => {
    const descriptor = JSON.parse(descriptorKey) as MarkerDescriptor;
    return registry.register(descriptor, controls);
  }, [registry, controls, descriptorKey]);

  useEffect(() => () => controls.dispose(), [controls]);

  const context = useMemo(() => ({ controls, size }), [controls, size]);
  return (
    <group ref={group} {...groupProps}>
      <MarkerContext.Provider value={context}>{children}</MarkerContext.Provider>
    </group>
  );
}
