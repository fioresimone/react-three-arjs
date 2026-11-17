const EARTH_RADIUS = 6371000;
const HALF_EARTH = 20037508.34;
const DEG = Math.PI / 180;

/** A map projection from longitude/latitude (degrees) to planar metres. */
export interface GeoProjection {
  /** Returns `[x, y]`: x grows eastwards, y northwards. */
  project(lon: number, lat: number): [number, number];
  unproject(x: number, y: number): [number, number];
  readonly id: string;
}

/**
 * Spherical Mercator (EPSG:3857), the projection AR.js uses. Distances are
 * inflated by 1/cos(latitude), so 1 world unit is less than 1 metre away from
 * the equator; prefer {@link LocalTangentProjection} for true metres.
 */
export class SphMercProjection implements GeoProjection {
  readonly id = 'epsg:3857';

  project(lon: number, lat: number): [number, number] {
    return [(lon / 180) * HALF_EARTH, this.#latToY(lat)];
  }

  unproject(x: number, y: number): [number, number] {
    const lon = (x / HALF_EARTH) * 180;
    const latDeg = (y / HALF_EARTH) * 180;
    const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(latDeg * DEG)) - Math.PI / 2);
    return [lon, lat];
  }

  #latToY(lat: number): number {
    const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / DEG;
    return (y * HALF_EARTH) / 180;
  }
}

/**
 * Equirectangular projection around a reference point: 1 world unit is
 * 1 metre near that point. Accurate to well under 1% within a few
 * kilometres, which covers location-based AR content. New in this library.
 */
export class LocalTangentProjection implements GeoProjection {
  readonly id = 'local-tangent';
  readonly originLon: number;
  readonly originLat: number;
  readonly #cosLat: number;

  constructor(originLon: number, originLat: number) {
    this.originLon = originLon;
    this.originLat = originLat;
    this.#cosLat = Math.cos(originLat * DEG);
  }

  project(lon: number, lat: number): [number, number] {
    return [
      (lon - this.originLon) * DEG * EARTH_RADIUS * this.#cosLat,
      (lat - this.originLat) * DEG * EARTH_RADIUS,
    ];
  }

  unproject(x: number, y: number): [number, number] {
    return [
      this.originLon + x / (DEG * EARTH_RADIUS * this.#cosLat),
      this.originLat + y / (DEG * EARTH_RADIUS),
    ];
  }
}

export interface LonLat {
  longitude: number;
  latitude: number;
}

/** Great-circle distance in metres (haversine), as used by AR.js. */
export function haversineDistance(a: LonLat, b: LonLat): number {
  const dLon = (b.longitude - a.longitude) * DEG;
  const dLat = (b.latitude - a.latitude) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * DEG) * Math.cos(b.latitude * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * EARTH_RADIUS;
}

/** Initial bearing from `a` to `b`, in degrees clockwise from true north. */
export function bearing(a: LonLat, b: LonLat): number {
  const φ1 = a.latitude * DEG;
  const φ2 = b.latitude * DEG;
  const Δλ = (b.longitude - a.longitude) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}
