import { defineConfig, loadEnv } from "vite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  /** From `.env`, `.env.local`, `.env.[mode]` — used when developing locally. */
  const envFromFiles = loadEnv(mode, root, "");
  /** GitHub Actions / CI sets these on `process.env` at build time (no `.env` file there). */
  const gCloudClientId =
    process.env.G_CLOUD_CLIENT_ID ?? envFromFiles.G_CLOUD_CLIENT_ID ?? "";
  const base =
    process.env.VITE_BASE_PATH?.trim() ||
    envFromFiles.VITE_BASE_PATH?.trim() ||
    "/";
  const rollupInput: Record<string, string> = {
    index: resolve(root, "index.html"),
  };
  const uiV2Path = resolve(root, "ui-v2.html");
  if (existsSync(uiV2Path)) {
    rollupInput.uiV2 = uiV2Path;
  }
  return {
    base,
    define: {
      __G_CLOUD_CLIENT_ID__: JSON.stringify(gCloudClientId),
    },
    build: {
      rollupOptions: {
        input: rollupInput,
      },
    },
  };
});
