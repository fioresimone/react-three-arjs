# Third-party notices

## AR.js — MIT

This library is a TypeScript rewrite of parts of [AR.js](https://github.com/AR-js-org/AR.js)
(Copyright (c) 2020 AR.js, MIT). Algorithms ported from it include marker smoothing,
`ArSmoothedControls` interpolation, `LocationBased`, the Spherical Mercator projection and
the AR.js fork of `DeviceOrientationControls`. The files `assets/camera_para.dat`,
`assets/patt.hiro` and `assets/patt.kanji` are copied from AR.js.

## three.js — MIT

`DeviceOrientationControls` derives from the three.js example of the same name
(Copyright © 2010-2026 three.js authors, MIT).

## ARToolKit engine

Marker detection uses [`@ar-js-org/artoolkit5-ts`](https://github.com/AR-js-org/artoolkit5-ts)
and [`@ar-js-org/artoolkit5-wasm`](https://github.com/AR-js-org/artoolkit5-wasm), both
published under the MIT license by AR-js-org. A copy of `artoolkit5.wasm` from
`@ar-js-org/artoolkit5-wasm` is inlined in this package as a lazily loaded chunk, used only
when no `wasmUrl` is supplied.

The WebAssembly binary is compiled from WebARKitLib, a derivative of ARToolKit 5, which
upstream is distributed under the LGPL-3.0. The binary is a separate, replaceable component:
pass `wasmUrl` to load any compatible build instead.
