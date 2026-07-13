/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// `process` is a Node runtime global: this config file runs under Node during
// the build. Declared locally because @types/node is intentionally not part of
// the app's type surface (it targets the browser).
declare const process: { env: Record<string, string | undefined> };

/**
 * The developer-only visualisation (src/dev) is gated on `__SLOWTIDE_DEV_TOOLS__`.
 * `define` bakes it to `false` in a normal production build, so the whole module
 * is tree-shaken out and can never reach the child-facing surface. This is keyed
 * off `command`, not NODE_ENV: the Docker image sets NODE_ENV=development, which
 * would otherwise leave `import.meta.env.DEV` true even during `vite build`.
 *
 * Setting SLOWTIDE_PREVIEW=1 at build time also turns the flag on in a
 * production-like build, so the dev experience (auto-start into the forest at
 * the real time of day, plus the on-screen toolbar) can be inspected. This is a
 * build-time opt-in only: a plain `vite build` still ships neutral and never
 * auto-starts, honouring FR-1b and D-7.
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
    __SLOWTIDE_DEV_TOOLS__: JSON.stringify(
      command === "serve" || process.env.SLOWTIDE_PREVIEW === "1",
    ),
    // A human-readable stamp of when this bundle was built. Shown only in the
    // parent area so a parent can confirm at a glance that a deploy landed
    // (never on the child surface; NFR-1). Prefer an injected commit/tag if the
    // deploy provides one, else fall back to the build time.
    __SLOWTIDE_BUILD_ID__: JSON.stringify(
      process.env.SLOWTIDE_BUILD_ID ?? new Date().toISOString(),
    ),
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
    // Allow any host so a tunnelled URL (e.g. a cloudflared *.trycloudflare.com
    // address) can reach this local preview when testing on a real iPad. This
    // affects only the local `vite preview` server, never the deployed static
    // site (served by nginx / GitHub Pages), so it has no production impact.
    allowedHosts: true,
  },
  plugins: [
    devToolsFlag,
    VitePWA({
      registerType: "autoUpdate",
      // We register the worker ourselves (src/platform/app-update.ts) so we can
      // re-check for a new deploy on foreground and expose a manual force-update
      // behind the parent gate. Disable the plugin's own registerSW.js injection
      // to avoid registering the worker twice.
      injectRegister: false,
      // Offline-first: precache the app shell and assets (NFR-8).
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Take over immediately on a new deploy so an already-open page can be
        // reloaded onto the latest build (paired with the controllerchange
        // reload in src/platform/app-update.ts). The plugin sets these itself
        // only when it injects its own registerSW; we register the worker
        // ourselves (injectRegister:false), so set them explicitly.
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: "Slowtide",
        short_name: "Slowtide",
        description: "A calm, parent-set bedtime wind-down.",
        display: "fullscreen",
        // Follow the device rather than locking to landscape, so the app also
        // runs correctly in portrait on a phone (the layout is safe-area aware).
        orientation: "any",
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
