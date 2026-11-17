import { ArError, cameraErrorFrom } from '../errors';

/** Live camera input. */
export interface WebcamSourceOptions {
  type: 'webcam';
  /** `'environment'` (rear camera, default) or `'user'` (front camera). Ignored when `deviceId` is set. */
  facingMode?: 'environment' | 'user';
  /** Exact camera to open, from {@link listCameraDevices}. */
  deviceId?: string;
  /** Ideal capture width. Default 640, as in AR.js. */
  width?: number;
  /** Ideal capture height. Default 480, as in AR.js. */
  height?: number;
}

/** A video file, useful for demos and automated tests. */
export interface VideoSourceOptions {
  type: 'video';
  url: string;
  /** Default true. */
  loop?: boolean;
}

/** A still image, useful for demos and automated tests. */
export interface ImageSourceOptions {
  type: 'image';
  url: string;
}

export type SourceOptions = WebcamSourceOptions | VideoSourceOptions | ImageSourceOptions;

/** The element frames are read from. */
export type SourceElement = HTMLVideoElement | HTMLImageElement;

/** An opened source. Call {@link ArSource.dispose} to stop the camera. */
export interface ArSource {
  readonly options: SourceOptions;
  readonly element: SourceElement;
  /** Intrinsic frame width in pixels. Changes when a phone rotates. */
  readonly width: number;
  /** Intrinsic frame height in pixels. Changes when a phone rotates. */
  readonly height: number;
  /** The camera stream, for webcam sources. */
  readonly stream: MediaStream | null;
  /** Subscribes to frame-size changes (device rotation). Returns an unsubscribe function. */
  onResize(listener: (width: number, height: number) => void): () => void;
  dispose(): void;
}

/**
 * Opens a camera, video or image and resolves once its first frame is ready.
 *
 * Pass an `AbortSignal` to cancel: React StrictMode mounts effects twice, and
 * a cancelled open must release the camera rather than leave it running.
 */
export async function openSource(
  options: SourceOptions,
  { signal }: { signal?: AbortSignal } = {},
): Promise<ArSource> {
  switch (options.type) {
    case 'webcam':
      return openWebcam(options, signal);
    case 'video':
      return openVideo(options, signal);
    case 'image':
      return openImage(options, signal);
  }
}

function createVideoElement(): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  return video;
}

function videoSource(
  options: SourceOptions,
  video: HTMLVideoElement,
  stream: MediaStream | null,
): ArSource {
  const listeners = new Set<(w: number, h: number) => void>();
  let width = video.videoWidth;
  let height = video.videoHeight;
  const onResize = (): void => {
    if (video.videoWidth === width && video.videoHeight === height) return;
    width = video.videoWidth;
    height = video.videoHeight;
    for (const l of listeners) l(width, height);
  };
  video.addEventListener('resize', onResize);
  return {
    options,
    element: video,
    stream,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    onResize(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      video.removeEventListener('resize', onResize);
      listeners.clear();
      stream?.getTracks().forEach((t) => t.stop());
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
      video.load();
    },
  };
}

function waitForVideo(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onReady = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new ArError('source-load-failed', 'The video could not be loaded.'));
    };
    const onAbort = (): void => {
      cleanup();
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
  });
}

async function openWebcam(options: WebcamSourceOptions, signal?: AbortSignal): Promise<ArSource> {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    throw new ArError(
      'insecure-context',
      'The camera needs a secure context (https or localhost).',
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new ArError('unsupported', 'This browser cannot access the camera.');
  }
  const video: MediaTrackConstraints = {
    width: { ideal: options.width ?? 640 },
    height: { ideal: options.height ?? 480 },
  };
  if (options.deviceId) video.deviceId = { exact: options.deviceId };
  else video.facingMode = options.facingMode ?? 'environment';

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
  } catch (error) {
    throw cameraErrorFrom(error);
  }
  if (signal?.aborted) {
    stream.getTracks().forEach((t) => t.stop());
    throw signal.reason;
  }

  const element = createVideoElement();
  element.srcObject = stream;
  try {
    await element.play().catch(() => undefined);
    await waitForVideo(element, signal);
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    throw error;
  }
  return videoSource(options, element, stream);
}

async function openVideo(options: VideoSourceOptions, signal?: AbortSignal): Promise<ArSource> {
  const element = createVideoElement();
  element.crossOrigin = 'anonymous';
  element.loop = options.loop ?? true;
  element.src = options.url;
  await element.play().catch(() => undefined);
  await waitForVideo(element, signal);
  return videoSource(options, element, null);
}

async function openImage(options: ImageSourceOptions, signal?: AbortSignal): Promise<ArSource> {
  const element = new Image();
  element.crossOrigin = 'anonymous';
  element.src = options.url;
  try {
    await element.decode();
  } catch (error) {
    throw new ArError('source-load-failed', `The image could not be loaded: ${options.url}`, {
      cause: error,
    });
  }
  if (signal?.aborted) throw signal.reason;
  return {
    options,
    element,
    stream: null,
    width: element.naturalWidth,
    height: element.naturalHeight,
    onResize: () => () => undefined,
    dispose: () => undefined,
  };
}

/** Lists the cameras the user can choose from (labels need camera permission first). */
export async function listCameraDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}
