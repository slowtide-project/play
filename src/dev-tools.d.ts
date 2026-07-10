/**
 * Compile-time flag, defined in vite.config.ts, that is `true` only when Vite is
 * running the dev server (`command === "serve"`) and baked to `false` in every
 * production build. It gates the developer-only visualisation (src/dev) so that
 * module can never ship to the child-facing surface.
 *
 * This is deliberately used instead of `import.meta.env.DEV`, which is
 * unreliable here: the Docker image sets `NODE_ENV=development`, so Vite reports
 * `DEV === true` even during `vite build`.
 */
declare const __SLOWTIDE_DEV_TOOLS__: boolean;
