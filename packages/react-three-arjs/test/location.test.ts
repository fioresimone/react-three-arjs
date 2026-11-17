import { Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { smoothAngle } from '../src/core/location/device-orientation';
import { LocationBased } from '../src/core/location/location-based';
import {
  bearing,
  haversineDistance,
  LocalTangentProjection,
  SphMercProjection,
} from '../src/core/location/projection';

const LONDON = { longitude: -0.1278, latitude: 51.5074 };
const PARIS = { longitude: 2.3522, latitude: 48.8566 };

describe('geo maths', () => {
  it('haversine London-Paris is about 344 km', () => {
    expect(haversineDistance(LONDON, PARIS) / 1000).toBeCloseTo(343.6, 0);
  });

  it('bearing: due north is 0, due east is 90', () => {
    expect(bearing({ longitude: 0, latitude: 0 }, { longitude: 0, latitude: 1 })).toBeCloseTo(0);
    expect(bearing({ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 })).toBeCloseTo(90);
  });

  it('Spherical Mercator round-trips', () => {
    const p = new SphMercProjection();
    const [x, y] = p.project(LONDON.longitude, LONDON.latitude);
    const [lon, lat] = p.unproject(x, y);
    expect(lon).toBeCloseTo(LONDON.longitude, 9);
    expect(lat).toBeCloseTo(LONDON.latitude, 9);
  });

  it('local tangent projection is in metres near the origin', () => {
    const p = new LocalTangentProjection(LONDON.longitude, LONDON.latitude);
    const north = { longitude: LONDON.longitude, latitude: LONDON.latitude + 0.001 };
    const east = { longitude: LONDON.longitude + 0.001, latitude: LONDON.latitude };
    expect(p.project(north.longitude, north.latitude)[1]).toBeCloseTo(
      haversineDistance(LONDON, north),
      1,
    );
    expect(p.project(east.longitude, east.latitude)[0]).toBeCloseTo(
      haversineDistance(LONDON, east),
      1,
    );
  });
});

describe('LocationBased', () => {
  it('uses the first fix as origin and puts the camera there', () => {
    const camera = new Object3D();
    const lb = new LocationBased(camera);
    const onOrigin = vi.fn();
    lb.on('originset', onOrigin);
    expect(lb.ready).toBe(false);
    lb.fakeGps(LONDON.longitude, LONDON.latitude);
    expect(lb.ready).toBe(true);
    expect(onOrigin).toHaveBeenCalledWith(LONDON);
    expect(camera.position.x).toBeCloseTo(0);
    expect(camera.position.z).toBeCloseTo(0);
  });

  it('north is -Z and east is +X, in metres', () => {
    const lb = new LocationBased(new Object3D());
    lb.fakeGps(LONDON.longitude, LONDON.latitude);
    const [, zNorth] = lb.lonLatToWorldCoords(LONDON.longitude, LONDON.latitude + 0.001);
    const [xEast] = lb.lonLatToWorldCoords(LONDON.longitude + 0.001, LONDON.latitude);
    expect(zNorth).toBeCloseTo(-111.2, 0);
    expect(xEast).toBeGreaterThan(60);
    const back = lb.worldCoordsToLonLat(xEast, 0);
    expect(back.longitude).toBeCloseTo(LONDON.longitude + 0.001, 9);
  });

  it('keeps the AR.js Spherical Mercator behaviour available', () => {
    const lb = new LocationBased(new Object3D(), { projection: 'sphmerc' });
    lb.fakeGps(LONDON.longitude, LONDON.latitude);
    const [, z] = lb.lonLatToWorldCoords(LONDON.longitude, LONDON.latitude + 0.001);
    // Mercator inflates distances by 1/cos(latitude).
    expect(-z).toBeCloseTo(111.2 / Math.cos((LONDON.latitude * Math.PI) / 180), 0);
  });

  it('throws a clear error before the origin is known', () => {
    const lb = new LocationBased(new Object3D());
    expect(() => lb.lonLatToWorldCoords(0, 0)).toThrow(/origin/);
  });

  it('places objects and sets elevation', () => {
    const camera = new Object3D();
    const lb = new LocationBased(camera);
    lb.fakeGps(LONDON.longitude, LONDON.latitude, 12);
    expect(camera.position.y).toBe(12);
    const obj = new Object3D();
    lb.setWorldPosition(obj, LONDON.longitude, LONDON.latitude + 0.001, 30);
    expect(obj.position.y).toBe(30);
    expect(obj.position.z).toBeLessThan(0);
  });

  it('reports the distance to a point', () => {
    const lb = new LocationBased(new Object3D());
    expect(lb.distanceTo(PARIS.longitude, PARIS.latitude)).toBeNull();
    lb.fakeGps(LONDON.longitude, LONDON.latitude);
    expect((lb.distanceTo(PARIS.longitude, PARIS.latitude) ?? 0) / 1000).toBeCloseTo(343.6, 0);
  });
});

describe('smoothAngle', () => {
  it('k = 0 keeps the previous angle, k = 1 takes the new one', () => {
    expect(smoothAngle(1, 0.5, 0)).toBeCloseTo(0.5);
    expect(smoothAngle(1, 0.5, 1)).toBeCloseTo(1);
  });

  it('interpolates across the 0/2π wrap-around', () => {
    const r = smoothAngle(0.1, 2 * Math.PI - 0.1, 0.5);
    expect(Math.min(r, 2 * Math.PI - r)).toBeCloseTo(0, 5);
  });
});
