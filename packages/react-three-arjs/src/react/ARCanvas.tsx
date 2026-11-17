import { Canvas, type CanvasProps } from '@react-three/fiber';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ArError } from '../core/errors';
import type { FitMode } from '../core/math/projection';
import { openSource, type ArSource, type SourceOptions } from '../core/source/source';
import { ARCamera } from './ar-camera';
import { ARStore, ARStoreContext } from './store';

export interface ARCanvasProps extends Omit<
  CanvasProps,
  'camera' | 'children' | 'style' | 'onError' | 'className'
> {
  /** 3D content: `<MarkerTracking>` and/or `<LocationTracking>` and their children. */
  children?: ReactNode;
  /** Where frames come from. Default: the rear webcam. */
  source?: SourceOptions;
  /** How the camera image fills the view, like CSS `object-fit`. Default `'cover'`. */
  fit?: FitMode;
  /** Vertical field of view used when no marker calibration applies (location-based AR). Default 60. */
  fov?: number;
  near?: number;
  far?: number;
  /** DOM content layered over the scene. It can call `useAR()`. */
  overlay?: ReactNode;
  /** Style of the wrapping element. It fills its parent by default. */
  style?: CSSProperties;
  className?: string;
  /** Hide the camera image (the 3D scene still tracks). Default false. */
  hideVideo?: boolean;
  onSourceReady?: (source: ArSource) => void;
  /** Every error from the source, the tracker or the GPS. */
  onError?: (error: ArError) => void;
}

const fill: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' };

/**
 * The root of an AR scene: opens the camera, shows it behind a transparent
 * R3F `<Canvas>`, and provides the AR camera that trackers drive.
 *
 * Replaces the AR.js `arjs` A-Frame system and `ArToolkitSource`.
 */
export function ARCanvas({
  children,
  source = { type: 'webcam' },
  fit = 'cover',
  fov = 60,
  near = 0.01,
  far = 1000,
  overlay,
  style,
  className,
  hideVideo = false,
  onSourceReady,
  onError,
  gl,
  ...canvasProps
}: ARCanvasProps): ReactElement {
  const [store] = useState(() => {
    const camera = new ARCamera(fov, 1, near, far);
    return new ARStore(camera);
  });
  const videoHost = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSourceReady, onError });
  useLayoutEffect(() => {
    callbacks.current = { onSourceReady, onError };
    store.onError = onError;
  });

  useLayoutEffect(() => {
    const camera = store.camera;
    camera.fov = fov;
    camera.near = near;
    camera.far = far;
    camera.fit = fit;
    camera.updateProjectionMatrix();
  }, [store, fov, near, far, fit]);

  // Identity of `source` changes every render; its content is what matters.
  const sourceKey = JSON.stringify(source);
  useEffect(() => {
    const options = JSON.parse(sourceKey) as SourceOptions;
    const controller = new AbortController();
    let opened: ArSource | null = null;
    let unsubscribeResize: (() => void) | undefined;
    store.setState({ sourceStatus: 'loading', source: null, sourceSize: null, error: null });

    openSource(options, { signal: controller.signal }).then(
      (src) => {
        if (controller.signal.aborted) return src.dispose();
        opened = src;
        const el = src.element;
        Object.assign(el.style, fill, { objectFit: fit, pointerEvents: 'none' });
        videoHost.current?.appendChild(el);
        store.camera.sourceAspect = src.width / src.height;
        store.setState({
          sourceStatus: 'ready',
          source: src,
          sourceSize: { width: src.width, height: src.height },
        });
        unsubscribeResize = src.onResize((width, height) => {
          store.camera.sourceAspect = width / height;
          store.camera.updateProjectionMatrix();
          store.setState({ sourceSize: { width, height } });
        });
        callbacks.current.onSourceReady?.(src);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const arError =
          error instanceof ArError
            ? error
            : new ArError('source-load-failed', String(error), { cause: error });
        store.setState({ sourceStatus: 'error' });
        store.reportError(arError);
      },
    );

    return () => {
      controller.abort();
      unsubscribeResize?.();
      if (opened) {
        opened.element.remove();
        opened.dispose();
      }
      store.setState({ sourceStatus: 'idle', source: null, sourceSize: null });
    };
    // `fit` is applied by the effect below; reopening the camera for it would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, store]);

  const source_ = useSyncedSource(store);
  useEffect(() => {
    if (source_) source_.element.style.objectFit = fit;
  }, [source_, fit]);

  return (
    <ARStoreContext.Provider value={store}>
      <div
        className={className}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: '#000',
          ...style,
        }}
      >
        <div
          ref={videoHost}
          style={{ ...fill, visibility: hideVideo ? 'hidden' : 'visible' }}
          aria-hidden
        />
        <Canvas
          {...canvasProps}
          camera={store.camera}
          gl={gl ?? { alpha: true, antialias: true }}
          style={fill}
        >
          <ARStoreContext.Provider value={store}>{children}</ARStoreContext.Provider>
        </Canvas>
        {overlay}
      </div>
    </ARStoreContext.Provider>
  );
}

function useSyncedSource(store: ARStore): ArSource | null {
  const read = (): ArSource | null => store.getState().source;
  return useSyncExternalStore(store.subscribe, read, read);
}
