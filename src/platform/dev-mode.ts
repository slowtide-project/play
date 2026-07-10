/**
 * Resolves whether the developer tools are active for this launch.
 *
 * There are two independent ways they turn on:
 *
 *  - The compile-time flag `__SLOWTIDE_DEV_TOOLS__` (see vite.config.ts): true
 *    under the Vite dev server and in a `SLOWTIDE_PREVIEW=1` build. This also
 *    carries the local-only convenience of auto-starting into the forest, and is
 *    baked to `false` in the deployed build.
 *
 *  - A runtime unlock for the *deployed* build: a hidden, parent-only switch so
 *    the dev toolbar (time-of-day overrides, engine view, frame-time readout)
 *    can be reached on the live site without any visible control. It is opened
 *    with the `?dev=on` query once and remembered in local storage, and closed
 *    again with `?dev=off`. It is off by default, so a normal launch is
 *    unchanged and child-safe. Crucially, the runtime unlock never auto-starts a
 *    session — that convenience stays behind the compile-time flag only — so the
 *    deployed app still rests neutral and honours the parent gate (FR-1b) even
 *    while dev tools are unlocked.
 *
 * The runtime logic is factored out as {@link runtimeUnlock} with its inputs
 * injected, so it can be unit tested independently of the compile-time flag and
 * the ambient browser globals.
 */

/** Query key and value that toggle the runtime unlock, and the storage key. */
export const DEV_QUERY_KEY = "dev";
export const DEV_QUERY_ON = "on";
export const DEV_QUERY_OFF = "off";
export const DEV_STORAGE_KEY = "slowtide.dev";

/**
 * Decide the runtime unlock state from a URL query string and a storage, and
 * persist any change. `?dev=on` unlocks and remembers it; `?dev=off` clears it;
 * otherwise the remembered state stands. Pure but for the storage it is handed.
 */
export function runtimeUnlock(search: string, storage: Storage): boolean {
  const value = new URLSearchParams(search).get(DEV_QUERY_KEY);
  if (value === DEV_QUERY_OFF) {
    storage.removeItem(DEV_STORAGE_KEY);
    return false;
  }
  if (value === DEV_QUERY_ON) {
    storage.setItem(DEV_STORAGE_KEY, "1");
    return true;
  }
  return storage.getItem(DEV_STORAGE_KEY) === "1";
}

/** True when the compile-time preview/dev flag is set for this build. */
export function isPreviewBuild(): boolean {
  return typeof __SLOWTIDE_DEV_TOOLS__ !== "undefined" && __SLOWTIDE_DEV_TOOLS__;
}

/** Whether the dev tools should be active for this launch (either route). */
export function resolveDevMode(): boolean {
  if (isPreviewBuild()) return true;
  try {
    return runtimeUnlock(window.location.search, window.localStorage);
  } catch {
    return false;
  }
}
