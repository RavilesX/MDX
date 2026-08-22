import { defineConfig } from "vite";

// Tauri expects a fixed dev port and no obfuscated output on debug builds.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 5184 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    chunkSizeWarningLimit: 4096,
    // No manualChunks: the dynamic imports in src/markdown/lazy.ts already
    // give Rollup the split points, and letting it decide keeps the shared
    // highlight.js language modules out of the eagerly loaded bundle.
  },
});
