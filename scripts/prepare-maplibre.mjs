import { copyFile, mkdir } from "node:fs/promises";

// MapLibre 6 loads a separate ES-module worker. A bundler's import.meta.url
// points to a Next.js chunk, so serve the matching, pinned worker ourselves.
// npm's lockfile verifies the source package; do not fetch a separate CDN copy.
const publicDirectory = new URL("../public/", import.meta.url);
await mkdir(publicDirectory, { recursive: true });
await copyFile(
  new URL(
    "../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs",
    import.meta.url,
  ),
  new URL("maplibre-worker.mjs", publicDirectory),
);
