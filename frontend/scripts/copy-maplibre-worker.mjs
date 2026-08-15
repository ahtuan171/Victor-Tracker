/**
 * Copy MapLibre's worker bundle into `public/maplibre/`, so `MapView` can point
 * `setWorkerUrl` at a file whose own relative import actually resolves.
 *
 * **Why this exists — a Turbopack asset-emission bug, diagnosed 2026-08-15.** MapLibre 6 ships
 * ESM only, and its worker (`dist/maplibre-gl-worker.mjs`) imports a sibling shared chunk as
 * `from "./maplibre-gl-shared.mjs"`. Turbopack emits *both* files into `.next/static/media/`
 * but **hashes their filenames without rewriting that import**, so the worker asks for
 * `maplibre-gl-shared.mjs` while the emitted file is `maplibre-gl-shared.<hash>.mjs`. The
 * request 404s, the worker module fails to evaluate, and the worker dies on creation.
 *
 * The failure is close to silent, which is why it survived a whole phase: the style JSON,
 * `tiles.json`, sprite JSON and sprite PNG are all fetched on the **main thread** and load fine,
 * so `AttributionControl` renders its licence text and the map looks alive. Vector tiles are the
 * only thing fetched *from the worker* — so the map draws a correct, fully-wired, completely
 * black canvas with real markers floating on it, and no console error anywhere.
 *
 * Copying both files here, with their **original names**, makes the worker's own relative import
 * resolve against a sibling that exists. Regenerated on every `dev`/`build` rather than committed,
 * so it cannot drift from the installed maplibre-gl version; `public/maplibre/` is gitignored.
 */
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const from = path.join(root, "node_modules", "maplibre-gl", "dist");
const to = path.join(root, "public", "maplibre");

// Both are required: the worker is the entry point, the shared chunk is what it imports.
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(to, { recursive: true });
for (const file of FILES) {
  await copyFile(path.join(from, file), path.join(to, file));
}

console.log(`copied ${FILES.join(", ")} -> public/maplibre/`);
