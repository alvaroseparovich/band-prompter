import { defineConfig, loadEnv } from "vite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  const rollupInput: Record<string, string> = {
    index: resolve(root, "index.html"),
  };
  const uiV2Path = resolve(root, "ui-v2.html");
  if (existsSync(uiV2Path)) {
    rollupInput.uiV2 = uiV2Path;
  }
  const base = env.VITE_BASE_PATH?.trim() || "/";
  return {
    base,
    define: {
      __G_CLOUD_CLIENT_ID__: JSON.stringify(env.G_CLOUD_CLIENT_ID ?? ""),
    },
    build: {
      rollupOptions: {
        input: rollupInput,
      },
    },
  };
});
