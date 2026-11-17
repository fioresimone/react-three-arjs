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

Releases run in the **Release** GitHub workflow (`.github/workflows/release.yml`):

1. Describe a change with `pnpm changeset`, commit and merge to `main`.
2. The workflow opens a "Version packages" pull request (bumps versions, updates the
   changelog). Merge it.
3. The workflow then publishes every package version not yet on npm
   (`scripts/publish.mjs`) and creates a GitHub release.

The workflow can also be started by hand (_Actions → Release → Run workflow_).

npm authentication:

- **First release:** add an `NPM_TOKEN` repository secret: a granular access token on
  npmjs.com with read and write access to packages and "bypass 2FA" enabled (npm plans
  to stop direct publishing with these tokens in January 2027).
- **Afterwards:** on npmjs.com, open the package → _Settings_ → _Trusted publishing_,
  add GitHub Actions with repository `fioresimone/react-three-arjs` and workflow
  `release.yml`, then delete the `NPM_TOKEN` secret. No token is needed from then on.

Provenance attestations are added automatically once the repository is public.

## Known upstream issues worked around

- `@ar-js-org/artoolkit5-ts` 0.3.0: `disposeARToolKitState` aborts the WASM module
  (`core.delete()` double free). The library only calls `teardown()`.
- `@ar-js-org/artoolkit5-wasm` 0.4: in the combined pattern-and-barcode detection
  modes, pattern poses ignore the detected rotation. The library corrects it
  (`src/core/marker/pose.ts`), covered by integration tests.
