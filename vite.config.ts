import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  return {
    define: {
      __G_CLOUD_CLIENT_ID__: JSON.stringify(env.G_CLOUD_CLIENT_ID ?? ""),
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(root, "index.html"),
          uiV2: resolve(root, "ui-v2.html"),
        },
      },
    },
  };
});
