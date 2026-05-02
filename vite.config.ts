import { defineConfig, loadEnv } from "vite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  /** From `.env`, `.env.local`, `.env.[mode]` — used when developing locally. */
  const envFromFiles = loadEnv(mode, root, "");
  /** GitHub Actions / CI sets these on `process.env` at build time (no `.env` file there). */
  const gSheetsApiKey =
    process.env.G_SHEETS_API_KEY ?? envFromFiles.G_SHEETS_API_KEY ?? "";
  const isCi =
    process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
  if (isCi && !gSheetsApiKey) {
    throw new Error(
      "G_SHEETS_API_KEY is empty during CI build. Add it as an Actions secret named G_SHEETS_API_KEY (Repository Settings → Secrets and variables → Actions), and ensure the workflow passes it in the Build step env. Static hosting cannot read server env at runtime; the key must be present when `vite build` runs.",
    );
  }
  const base =
    process.env.VITE_BASE_PATH?.trim() ||
    envFromFiles.VITE_BASE_PATH?.trim() ||
    "/";
  const rollupInput: Record<string, string> = {
    index: resolve(root, "index.html"),
  };

  return {
    base,
    define: {
      __G_SHEETS_API_KEY__: JSON.stringify(gSheetsApiKey),
    },
    build: {
      rollupOptions: {
        input: rollupInput,
      },
    },
  };
});
