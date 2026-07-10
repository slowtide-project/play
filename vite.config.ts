/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * The developer-only visualisation (src/dev) is gated on `__SLOWTIDE_DEV_TOOLS__`.
 * `define` bakes it to `false` in every production build, so the whole module is
 * tree-shaken out and can never reach the child-facing surface. This is keyed off
 * `command`, not NODE_ENV: the Docker image sets NODE_ENV=development, which would
 * otherwise leave `import.meta.env.DEV` true even during `vite build`.
 *
 * `define` is only statically applied at build time, so this serve-only plugin
 * provides the flag as a runtime global for the dev server.
 */
const devToolsFlag: Plugin = {
  name: "slowtide-dev-tools-flag",
  apply: "serve",
  transformIndexHtml: () => [
    {
      tag: "script",
      injectTo: "head-prepend",
      children: "window.__SLOWTIDE_DEV_TOOLS__ = true;",
    },
  ],
};

// Served from a custom subdomain (see public/CNAME), so the base is root.
export default defineConfig(({ command }) => ({
  base: "/",
  define: {
    __SLOWTIDE_DEV_TOOLS__: JSON.stringify(command === "serve"),
  },
  // Bind to all interfaces so the dev server is reachable from the host when
  // running in Docker; polling makes file watching reliable over bind mounts.
  server: {
    host: true,
    port: 5173,
    watch: { usePolling: true },
  },
  preview: {
    host: true,
    port: 4173,
  },
  plugins: [
    devToolsFlag,
    VitePWA({
      registerType: "autoUpdate",
      // Offline-first: precache the app shell and assets (NFR-8).
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
      manifest: {
        name: "Slowtide",
        short_name: "Slowtide",
        description: "A calm, parent-set bedtime wind-down.",
        display: "fullscreen",
        orientation: "landscape",
        background_color: "#0b0d1a",
        theme_color: "#0b0d1a",
        // Icons are placeholders; replace with final artwork before release.
        icons: [],
      },
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/engine/**/*.ts"],
      // types.ts is declarations only; index.ts is a re-export barrel.
      exclude: ["src/engine/**/*.test.ts", "src/engine/index.ts", "src/engine/types.ts"],
      thresholds: {
        lines: 90,
        // Branches allow for unreachable defensive guards (fail-safe throws).
        branches: 85,
        functions: 90,
        statements: 90,
      },
    },
  },
}));
