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
