# react-three-arjs

Marker-based and location-based augmented reality for React Three Fiber — a TypeScript
rewrite of [AR.js](https://github.com/AR-js-org/AR.js).

- Library: [`@simonefiore/react-three-arjs`](packages/react-three-arjs) on npm,
  source in [`packages/react-three-arjs`](packages/react-three-arjs) — see its
  [README](packages/react-three-arjs/README.md) for the API.
- Demos: [`apps/demo`](apps/demo) — Hiro on a still image, Hiro and barcodes on the
  webcam, marker camera mode, location-based AR.

## Development

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm build          # build the library (also generates the inlined assets)
pnpm dev            # demo app on http://localhost:5173
pnpm test           # unit + ARToolKit integration tests (Vitest)
pnpm --filter demo test:e2e   # end-to-end tests in Chromium (Playwright)
pnpm lint && pnpm typecheck && pnpm check:package
```

To try the webcam demos on a phone, serve the demo over HTTPS on your network.

## Releasing

Changes are versioned with [Changesets](https://github.com/changesets/changesets):
run `pnpm changeset`, commit, and merge to `main`. The Release workflow opens a
"Version packages" pull request; merging it publishes to npm with provenance
(needs an `NPM_TOKEN` repository secret).

## Known upstream issues worked around

- `@ar-js-org/artoolkit5-ts` 0.3.0: `disposeARToolKitState` aborts the WASM module
  (`core.delete()` double free). The library only calls `teardown()`.
- `@ar-js-org/artoolkit5-wasm` 0.4: in the combined pattern-and-barcode detection
  modes, pattern poses ignore the detected rotation. The library corrects it
  (`src/core/marker/pose.ts`), covered by integration tests.
