/**
 * Entry point for the developer-only visualisation.
 *
 * This module (and everything it imports from ./dev-view) is loaded solely
 * behind an `import.meta.env.DEV` guard in app.ts, so the bundler drops it from
 * the production build entirely. It can never reach the child-facing surface.
 */

export { mountDevView } from "./dev-view.js";
