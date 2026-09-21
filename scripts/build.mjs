import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const watch = process.argv.includes("--watch");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all([
  cp(resolve(root, "extension/manifest.json"), resolve(dist, "manifest.json")),
  cp(resolve(root, "extension/sidepanel.html"), resolve(dist, "sidepanel.html")),
  cp(resolve(root, "extension/sidepanel.css"), resolve(dist, "sidepanel.css")),
  cp(resolve(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"), resolve(dist, "pdf.worker.min.mjs")),
]);

const extensionOptions = {
  entryPoints: {
    background: resolve(root, "extension/background.ts"),
    content: resolve(root, "extension/content.ts"),
    sidepanel: resolve(root, "extension/sidepanel.ts"),
  },
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir: dist,
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const extensionContext = await context(extensionOptions);
  await extensionContext.watch();
  console.log(`Watching extension sources. Load ${dist} as an unpacked extension.`);
} else {
  await build(extensionOptions);
}
