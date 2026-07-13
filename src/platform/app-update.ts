/**
 * Service-worker lifecycle for the PWA (D-4, NFR-8).
 *
 * `registerType: "autoUpdate"` in vite.config.ts already ships a worker that
 * calls skipWaiting()/clientsClaim(), so a fresh deploy is *capable* of taking
 * over. What was missing was the two things that make it happen without a manual
 * Safari history clear: (a) an already-open page reloading once the new worker
 * takes control, and (b) re-checking for a new build while the PWA sits on the
 * iPad home screen for days between opens. Both are wired in
 * {@link setupAutoUpdate}. autoUpdate performs the reload itself on activation.
 *
 * {@link forceReloadLatest} is the manual hammer behind the parent gate: it does
 * exactly what clearing browsing history did by hand (drop the worker and every
 * cache, then refetch from the network), for the rare case a parent wants to
 * force it immediately rather than wait for the next foreground check.
 *
 * This is all parent-/developer-facing plumbing; nothing here touches the child
 * surface or reveals session progress (NFR-1).
 */

import { registerSW } from "virtual:pwa-register";

/** Re-check for a new deployed build at most this often while left open (ms). */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Register the service worker and keep it fresh. On a deployed build this
 * installs the worker (offline-first, NFR-8) and, because the worker is built
 * with skipWaiting()/clientsClaim(), autoUpdate reloads the page automatically
 * when a newer build activates. We additionally poll for a new build and re-poll
 * whenever the app returns to the foreground, so reopening the home-screen PWA
 * after a deploy picks the new version up on its own.
 *
 * In the Vite dev server the service worker is disabled, so `registerSW` is a
 * no-op stub and this does nothing.
 */
export function setupAutoUpdate(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = (): void => {
        // No point hitting the network while offline; the worker keeps serving
        // the cached shell (NFR-8) and we retry on the next foreground.
        if (navigator.onLine) void registration.update();
      };
      window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });
}

/**
 * Force the very latest build now: unregister the service worker, delete every
 * cache, then reload from the network. This is the parent-gated equivalent of
 * clearing browsing history by hand; the register-on-load wiring reinstalls the
 * current worker after the reload, so offline support returns immediately
 * (NFR-8). Guarded throughout so a browser missing these APIs still reloads.
 */
export async function forceReloadLatest(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } finally {
    // The worker and caches are gone, so a plain reload refetches everything
    // from the network. (reload(true) is long deprecated and ignored.)
    window.location.reload();
  }
}
