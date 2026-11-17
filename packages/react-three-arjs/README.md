# react-three-arjs

Marker-based and location-based augmented reality for **React Three Fiber**.
A TypeScript rewrite of [AR.js](https://github.com/AR-js-org/AR.js) for React 19,
three.js and R3F 9.

- **Marker tracking**: AR.js pattern markers (Hiro, Kanji, custom `.patt`) and barcode
  markers (3x3 to 6x6 dictionaries), powered by ARToolKit compiled to WebAssembly.
- **Location-based AR**: place content at GPS coordinates; compass and gyroscope
  orientation, with the iOS permission flow handled for you.
- **Declarative**: `<ARCanvas>`, `<Marker>`, `<GpsPlace>`, plus hooks.
- **Framework-agnostic core**: everything is also usable with plain three.js via
  `@simonefiore/react-three-arjs/core`.
- **Zero config**: the engine, the calibration file and the Hiro/Kanji patterns are
  bundled, so it works in Vite, webpack and Next.js without copying assets.

## Install

```bash
npm install @simonefiore/react-three-arjs three @react-three/fiber react react-dom
```

Peer dependencies: `react` and `react-dom` 19, `@react-three/fiber` 9, `three` ≥ 0.170.

The camera needs a secure context: serve your app over `https` (or `localhost`).
To test on a phone during development, run Vite with `--host` behind HTTPS (for
example with `@vitejs/plugin-basic-ssl`).

## Marker-based AR

```tsx
import { ARCanvas, MarkerTracking, Marker } from '@simonefiore/react-three-arjs';

export function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <ARCanvas>
        <ambientLight />
        <MarkerTracking>
          <Marker preset="hiro" smoothing onFound={() => console.log('found')}>
            <mesh position-y={0.5}>
              <boxGeometry />
              <meshNormalMaterial />
            </mesh>
          </Marker>
        </MarkerTracking>
      </ARCanvas>
    </div>
  );
}
```

Print the [Hiro marker](https://raw.githubusercontent.com/AR-js-org/AR.js/master/data/images/hiro.png)
or show it on another screen.

### Marker coordinates

Same as AR.js: the marker lies in the XZ plane with its centre at the origin, **Y points
out of the marker**, X to its right edge and Z to its bottom edge. One unit equals the
marker width (`size`, default 1).

### Markers

```tsx
<Marker preset="hiro" />                         // built-in patterns: "hiro" | "kanji"
<Marker type="pattern" url="/markers/my.patt" />  // custom pattern (AR.js marker generator)
<Marker type="barcode" value={5} />               // barcode; set the dictionary on <MarkerTracking>
```

| Prop                              | Default             |                                                                                                            |
| --------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `size`                            | `1`                 | Marker width in scene units                                                                                |
| `smoothing`                       | `false`             | `true` (AR.js average), or `{ type: 'average' \| 'lerp' \| 'one-euro', ... }`                              |
| `foundDelay` / `lostDelay`        | `0`                 | Debounce in ms, removes flicker                                                                            |
| `changeMatrixMode`                | `'modelViewMatrix'` | `'cameraTransformMatrix'` keeps the content at the origin and moves the camera (AR.js `<a-marker-camera>`) |
| `keepVisibleWhenLost`             | `false`             | Keep the content at its last pose                                                                          |
| `onFound` / `onLost` / `onUpdate` |                     | Events                                                                                                     |

The marker group's transform is driven by the tracker: put offsets on its children.
Inside a marker, `useMarkerVisible()` and `useMarkerSize()` are available, and
`<MarkerHelper label="…" />` draws a debug outline with axes.

### Tracking options

`<MarkerTracking>` takes the AR.js `ArToolkitContext` parameters:

| Prop                                          | Default                                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detectionMode`                               | `'mono_and_matrix'` (patterns and barcodes)                                                                                                               |
| `matrixCodeType`                              | `'3x3'` (`'3x3_HAMMING63'`, `'3x3_PARITY65'`, `'4x4'`, `'4x4_BCH_13_9_3'`, `'4x4_BCH_13_5_5'`, `'5x5'`, `'5x5_BCH_22_12_5'`, `'5x5_BCH_22_7_7'`, `'6x6'`) |
| `labelingMode`                                | `'black_region'`                                                                                                                                          |
| `patternRatio`                                | `0.5`                                                                                                                                                     |
| `minConfidence`                               | `0.6`                                                                                                                                                     |
| `maxDetectionRate`                            | `60` per second                                                                                                                                           |
| `maxProcessingSize`                           | `640` px (longer side of the analysed frame)                                                                                                              |
| `threshold`, `thresholdMode`, `imageProcMode` | engine defaults                                                                                                                                           |
| `cameraParametersUrl`                         | bundled `camera_para.dat`                                                                                                                                 |
| `wasmUrl`                                     | bundled, lazily loaded                                                                                                                                    |

## Location-based AR

```tsx
import { ARCanvas, LocationTracking, GpsPlace, useAR } from '@simonefiore/react-three-arjs';

function EnableCompass() {
  const { orientationPermission, requestOrientationPermission } = useAR();
  if (orientationPermission !== 'prompt') return null;
  return <button onClick={requestOrientationPermission}>Enable compass</button>; // iOS
}

export function App() {
  return (
    <ARCanvas fov={70} overlay={<EnableCompass />}>
      <LocationTracking gpsMinAccuracy={50}>
        <GpsPlace latitude={45.4642} longitude={9.19} maxDistance={500}>
          <mesh scale={10}>
            <boxGeometry />
            <meshNormalMaterial />
          </mesh>
        </GpsPlace>
      </LocationTracking>
    </ARCanvas>
  );
}
```

World axes: X points east, −Z north, Y up; 1 unit = 1 metre.

`<LocationTracking>` props: `simulate={{ latitude, longitude, altitude }}` (desktop
testing), `orientation={false | { smoothingFactor, compassHeadingCorrection }}`,
`gpsMinDistance`, `gpsMinAccuracy`, `maximumAge`, `useAltitude`,
`projection` (`'local'` metres, default, or `'sphmerc'` as in AR.js),
`initialPositionAsOrigin`, `onGpsUpdate`, `onOriginSet`, `onError`.

`<GpsPlace>` props: `latitude`, `longitude`, `altitude`, `minDistance`, `maxDistance`,
`onDistanceChange`. `useGpsDistance(lat, lon)` returns the live distance in metres.

## `<ARCanvas>`

| Prop                       | Default              |                                                                                                                    |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `source`                   | `{ type: 'webcam' }` | Or `{ type: 'webcam', deviceId \| facingMode, width, height }`, `{ type: 'video', url }`, `{ type: 'image', url }` |
| `fit`                      | `'cover'`            | How the camera image fills the view; the 3D projection follows it                                                  |
| `fov`, `near`, `far`       | `60`, `0.01`, `1000` | Camera, when no marker calibration applies                                                                         |
| `overlay`                  |                      | DOM content over the scene; can use `useAR()`                                                                      |
| `hideVideo`                | `false`              |                                                                                                                    |
| `onSourceReady`, `onError` |                      |                                                                                                                    |

All other R3F `<Canvas>` props are passed through. `useCameraDevices()` lists the
cameras for a camera picker.

### State and errors

`useAR()` (anywhere under `<ARCanvas>`, including `overlay`) returns `sourceStatus`,
`sourceSize`, `error`, `markerTrackingReady`, `gpsPosition`, `gpsOrigin`,
`orientationPermission` and `requestOrientationPermission()`. Pass a selector to
re-render only on what you use: `useAR((s) => s.error)`.

Errors are `ArError` instances with a stable `code`: `insecure-context`,
`camera-permission-denied`, `camera-not-found`, `camera-in-use`,
`engine-init-failed`, `marker-load-failed`, `gps-permission-denied`, `gps-timeout`, …

## Without React

```ts
import {
  openSource,
  MarkerTracker,
  MarkerControls,
  fitProjectionToView,
} from '@simonefiore/react-three-arjs/core';

const source = await openSource({ type: 'webcam' });
const tracker = await MarkerTracker.create(source.width, source.height);
const hiro = await tracker.addMarker({ type: 'pattern', url: HIRO_PATTERN_URL });
const controls = new MarkerControls({ smoothing: { type: 'one-euro' } });
// every frame:
const { detected } = tracker.process(source.element);
const hit = detected.find((d) => d.handle.key === hiro.key);
controls.update(hit?.matrix ?? null, performance.now());
mesh.matrix.copy(controls.matrix);
```

`LocationBased`, `DeviceOrientationControls`, the projections and smoothing filters are
exported too.

## Bundler notes

The engine (≈ 270 KB of WebAssembly) is inlined in a lazily loaded chunk, so nothing
needs configuring. To serve the `.wasm` file yourself instead (smaller transfer), add
`@ar-js-org/artoolkit5-wasm` to your dependencies and pass its URL:

```tsx
import wasmUrl from '@ar-js-org/artoolkit5-wasm/dist/artoolkit5.wasm?url'; // Vite
<MarkerTracking wasmUrl={wasmUrl}>…</MarkerTracking>;
```

## Migrating from AR.js

| AR.js                                                                    | react-three-arjs                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `<a-scene arjs>` / `ArToolkitSource` + `ArToolkitContext`                | `<ARCanvas>` + `<MarkerTracking>`                              |
| `<a-marker preset="hiro">` / `ArMarkerControls`                          | `<Marker preset="hiro">`                                       |
| `<a-marker type="barcode" value="5">`                                    | `<Marker type="barcode" value={5}>`                            |
| `<a-marker-camera>`                                                      | `<Marker changeMatrixMode="cameraTransformMatrix">`            |
| `smooth`, `smoothCount`, `smoothTolerance`, `smoothThreshold`            | `smoothing={{ type: 'average', count, tolerance, threshold }}` |
| `ArSmoothedControls`                                                     | `smoothing={{ type: 'lerp' }}` + `foundDelay` / `lostDelay`    |
| `ArMarkerHelper`                                                         | `<MarkerHelper>`                                               |
| `markerFound` / `markerLost` events                                      | `onFound` / `onLost`                                           |
| `gps-new-camera`, `gps-camera`, `gps-projected-camera`                   | `<LocationTracking>`                                           |
| `gps-new-entity-place`, `gps-entity-place`, `gps-projected-entity-place` | `<GpsPlace>`                                                   |
| `simulateLatitude` / `simulateLongitude` / `simulateAltitude`            | `simulate={{ latitude, longitude, altitude }}`                 |
| `positionMinAccuracy`, `gpsTimeInterval`                                 | `gpsMinAccuracy`, `maximumAge`                                 |
| `arjs-device-orientation-controls smoothingFactor`                       | `orientation={{ smoothingFactor }}`                            |
| `gps-camera-update-position`, `gps-camera-origin-coord-set`              | `onGpsUpdate`, `onOriginSet`                                   |
| three.js `LocationBased`, `DeviceOrientationControls`                    | same names in `@simonefiore/react-three-arjs/core`             |

Differences on purpose:

- The camera image keeps its aspect ratio (no stretched feed) and the 3D projection
  follows the CSS crop.
- Portrait frames use a rotated calibration instead of a stretched one.
- Location-based AR defaults to metres around the first GPS fix (`projection: 'local'`)
  instead of Spherical Mercator, avoiding float precision jitter far from the equator.
- Smoothing also works in camera mode.
- Errors are reported as values (`onError`, `useAR().error`) instead of `alert()`.

Not included in this version: NFT image tracking, multi-marker areas, hit testing.

## License

MIT. Contains code ported from AR.js (MIT); see `THIRD_PARTY_NOTICES.md`.
