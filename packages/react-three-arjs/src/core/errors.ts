/**
 * Every failure the library can report, as a stable machine-readable code.
 *
 * AR.js reported most of these through `alert()` or a DOM popup. Here they
 * are values: components surface them through `onError` callbacks and hooks,
 * and the application decides how to show them.
 */
export type ArErrorCode =
  | 'insecure-context'
  | 'unsupported'
  | 'camera-permission-denied'
  | 'camera-not-found'
  | 'camera-in-use'
  | 'camera-constraints'
  | 'source-load-failed'
  | 'engine-init-failed'
  | 'marker-load-failed'
  | 'gps-permission-denied'
  | 'gps-unavailable'
  | 'gps-timeout'
  | 'orientation-permission-denied'
  | 'unknown';

/** Error type thrown or reported by every part of the library. */
export class ArError extends Error {
  override readonly name = 'ArError';
  readonly code: ArErrorCode;

  constructor(code: ArErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/** Maps a `getUserMedia` rejection to an {@link ArError}. */
export function cameraErrorFrom(error: unknown): ArError {
  if (error instanceof ArError) return error;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new ArError('camera-permission-denied', 'Camera permission was denied.', {
        cause: error,
      });
    case 'NotFoundError':
    case 'OverconstrainedError':
      return name === 'NotFoundError'
        ? new ArError('camera-not-found', 'No camera matches the request.', { cause: error })
        : new ArError('camera-constraints', `Camera constraints cannot be met: ${message}`, {
            cause: error,
          });
    case 'NotReadableError':
    case 'AbortError':
      return new ArError('camera-in-use', 'The camera is in use or could not be started.', {
        cause: error,
      });
    default:
      return new ArError('unknown', message || 'Unknown camera error.', { cause: error });
  }
}

/** Maps a `GeolocationPositionError` to an {@link ArError}. */
export function gpsErrorFrom(
  error: GeolocationPositionError | { code: number; message?: string },
): ArError {
  switch (error.code) {
    case 1:
      return new ArError('gps-permission-denied', 'Location permission was denied.', {
        cause: error,
      });
    case 3:
      return new ArError('gps-timeout', 'Timed out while waiting for a location.', {
        cause: error,
      });
    default:
      return new ArError('gps-unavailable', error.message || 'Location is unavailable.', {
        cause: error,
      });
  }
}
