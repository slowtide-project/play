/**
 * Compile-time build stamp, defined in vite.config.ts. A commit/tag string when
 * the deploy provides SLOWTIDE_BUILD_ID, otherwise the ISO build time. Shown
 * only in the parent area so a parent can confirm a deploy landed; never on the
 * child-facing surface (NFR-1).
 */
declare const __SLOWTIDE_BUILD_ID__: string;
