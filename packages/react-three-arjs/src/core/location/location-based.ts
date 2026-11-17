import type { Object3D } from 'three';
import { Emitter } from '../emitter';
import { ArError, gpsErrorFrom } from '../errors';
import {
  haversineDistance,
  LocalTangentProjection,
  SphMercProjection,
  type GeoProjection,
  type LonLat,
} from './projection';

export interface GpsPosition extends LonLat {
  /** Metres above sea level, when the device reports it. */
  altitude: number | null;
  /** Horizontal accuracy in metres. */
  accuracy: number;
  timestamp: number;
}

export interface LocationBasedOptions {
  /**
   * World projection:
   * - `'local'` (default): metres around the world origin. New in this library.
   * - `'sphmerc'`: Spherical Mercator, as in AR.js.
   * - or any {@link GeoProjection}.
   */
  projection?: 'local' | 'sphmerc' | GeoProjection;
  /** Ignore GPS updates closer than this many metres to the last one. Default 0. */
  gpsMinDistance?: number;
  /** Ignore GPS fixes less accurate than this many metres. Default 100. */
  gpsMinAccuracy?: number;
  /** Geolocation `maximumAge` in ms (AR.js `gpsTimeInterval`). Default 0. */
  maximumAge?: number;
  /**
   * Use the first GPS fix as the world origin, keeping coordinates small and
   * avoiding float precision jitter (AR.js issue #499). Default true; AR.js
   * defaulted to false. Always true for the `'local'` projection.
   */
  initialPositionAsOrigin?: boolean;
  /** Move the camera to the GPS altitude. Default false. */
  useAltitude?: boolean;
}

export interface LocationBasedEvents {
  [key: string]: unknown;
  gpsupdate: { position: GpsPosition; distanceMoved: number };
  gpserror: ArError;
  originset: LonLat;
}

/**
 * Places a camera and objects in the world from GPS coordinates. A typed
 * port of the AR.js three.js `LocationBased` class, merged with the options
 * of the A-Frame `gps-new-camera` and classic `gps-camera` components.
 *
 * World axes: x points east, -z points north, y is up.
 */
export class LocationBased extends Emitter<LocationBasedEvents> {
  readonly camera: Object3D;
  gpsMinDistance: number;
  gpsMinAccuracy: number;
  maximumAge: number;
  useAltitude: boolean;

  #projectionOption: 'local' | 'sphmerc' | GeoProjection;
  #projection: GeoProjection | null;
  #initialPositionAsOrigin: boolean;
  #origin: [number, number] | null = null;
  #originLonLat: LonLat | null = null;
  #last: GpsPosition | null = null;
  #watchId: number | null = null;

  constructor(camera: Object3D, options: LocationBasedOptions = {}) {
    super();
    this.camera = camera;
    this.gpsMinDistance = options.gpsMinDistance ?? 0;
    this.gpsMinAccuracy = options.gpsMinAccuracy ?? 100;
    this.maximumAge = options.maximumAge ?? 0;
    this.useAltitude = options.useAltitude ?? false;
    this.#projectionOption = options.projection ?? 'local';
    this.#initialPositionAsOrigin =
      this.#projectionOption === 'local' ? true : (options.initialPositionAsOrigin ?? true);
    this.#projection =
      this.#projectionOption === 'sphmerc'
        ? new SphMercProjection()
        : typeof this.#projectionOption === 'object'
          ? this.#projectionOption
          : null;
  }

  /** The last accepted GPS position. */
  get position(): GpsPosition | null {
    return this.#last;
  }

  /** The world origin, once known. */
  get origin(): LonLat | null {
    return this.#originLonLat;
  }

  /** Whether world coordinates can be computed yet. */
  get ready(): boolean {
    return this.#projection !== null && (!this.#initialPositionAsOrigin || this.#origin !== null);
  }

  get watching(): boolean {
    return this.#watchId !== null;
  }

  /** Starts watching the device position. Returns false if already started. */
  startGps(maximumAge: number = this.maximumAge): boolean {
    if (this.#watchId !== null) return false;
    if (!('geolocation' in navigator)) {
      this.emit('gpserror', new ArError('unsupported', 'This browser has no geolocation.'));
      return false;
    }
    this.#watchId = navigator.geolocation.watchPosition(
      (p) =>
        this.#received({
          longitude: p.coords.longitude,
          latitude: p.coords.latitude,
          altitude: p.coords.altitude,
          accuracy: p.coords.accuracy,
          timestamp: p.timestamp,
        }),
      (error) => this.emit('gpserror', gpsErrorFrom(error)),
      { enableHighAccuracy: true, maximumAge },
    );
    return true;
  }

  stopGps(): boolean {
    if (this.#watchId === null) return false;
    navigator.geolocation.clearWatch(this.#watchId);
    this.#watchId = null;
    return true;
  }

  /** Simulates a GPS fix (AR.js `fakeGps` / `simulateLatitude` etc.). */
  fakeGps(longitude: number, latitude: number, altitude: number | null = null, accuracy = 0): void {
    if (altitude !== null) this.setElevation(altitude);
    this.#received({ longitude, latitude, altitude, accuracy, timestamp: Date.now() }, true);
  }

  /** Sets the world origin explicitly. */
  setWorldOrigin(longitude: number, latitude: number): void {
    if (this.#projectionOption === 'local') {
      this.#projection = new LocalTangentProjection(longitude, latitude);
      this.#origin = [0, 0];
    } else {
      this.#origin = (this.#projection as GeoProjection).project(longitude, latitude);
    }
    this.#originLonLat = { longitude, latitude };
    this.emit('originset', { longitude, latitude });
  }

  /**
   * World `[x, z]` for a longitude/latitude. Throws until {@link ready}:
   * check it, or listen for `originset`.
   */
  lonLatToWorldCoords(longitude: number, latitude: number): [number, number] {
    if (!this.ready || !this.#projection) {
      throw new ArError(
        'gps-unavailable',
        'The world origin is not known yet: wait for the first GPS fix or call setWorldOrigin().',
      );
    }
    const [x, y] = this.#projection.project(longitude, latitude);
    const [ox, oy] = this.#initialPositionAsOrigin && this.#origin ? this.#origin : [0, 0];
    return [x - ox, -(y - oy)];
  }

  /** Inverse of {@link lonLatToWorldCoords}. */
  worldCoordsToLonLat(x: number, z: number): LonLat {
    if (!this.ready || !this.#projection) {
      throw new ArError('gps-unavailable', 'The world origin is not known yet.');
    }
    const [ox, oy] = this.#initialPositionAsOrigin && this.#origin ? this.#origin : [0, 0];
    const [longitude, latitude] = this.#projection.unproject(x + ox, -z + oy);
    return { longitude, latitude };
  }

  /** Moves `object` to a longitude/latitude, and to `elevation` metres if given. */
  setWorldPosition(
    object: Object3D,
    longitude: number,
    latitude: number,
    elevation?: number,
  ): void {
    const [x, z] = this.lonLatToWorldCoords(longitude, latitude);
    object.position.x = x;
    object.position.z = z;
    if (elevation !== undefined) object.position.y = elevation;
  }

  /** Sets the camera height in metres. */
  setElevation(elevation: number): void {
    this.camera.position.y = elevation;
  }

  /** Metres from the last GPS position to a point, or null before the first fix. */
  distanceTo(longitude: number, latitude: number): number | null {
    return this.#last ? haversineDistance(this.#last, { longitude, latitude }) : null;
  }

  dispose(): void {
    this.stopGps();
    this.removeAllListeners();
  }

  #received(position: GpsPosition, force = false): void {
    if (!force && position.accuracy > this.gpsMinAccuracy) return;
    const distanceMoved = this.#last ? haversineDistance(this.#last, position) : Number.MAX_VALUE;
    if (!force && distanceMoved < this.gpsMinDistance) return;
    this.#last = position;
    if (this.#initialPositionAsOrigin && !this.#origin) {
      this.setWorldOrigin(position.longitude, position.latitude);
    }
    this.setWorldPosition(
      this.camera,
      position.longitude,
      position.latitude,
      this.useAltitude && position.altitude != null ? position.altitude : undefined,
    );
    this.emit('gpsupdate', { position, distanceMoved });
  }
}
