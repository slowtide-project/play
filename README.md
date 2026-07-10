CONFIDENTIALITY: PUBLIC
STATUS: DRAFT - UNREVIEWED

# Slowtide (play)

Slowtide is a bedtime wind-down PWA. A single hidden "arousal budget" decays over a parent-set session (60 or 90 minutes), and every sensory and interaction parameter reads from it, so the experience starts engaging and drifts to calm without any visible timer or open-ended browsing.

This package is the PoC build. The current seed implements the arousal-budget engine with full unit tests, plus the tooling, PWA setup, and deploy pipeline. The child-facing rendering, the parent setup UI, and the toys are built on top of this.

This repository is the public app code. The product concept, functional requirements, and engineering standards are maintained privately by the project owner and are not part of this repo.

## Quick start (Docker only)

The only tool you need installed is Docker. Everything (dependencies, dev server, tests, lint, build, preview) runs in containers.

```
docker compose up dev                              # dev server at http://localhost:5173
docker compose run --rm ci                         # full gate: typecheck, lint, format, test, build
docker compose run --rm app npm run test:watch     # any one-off npm command
docker compose --profile preview up --build preview  # built PWA at http://localhost:8080
```

`ci` runs `npm run verify`, the same gate required before every commit. The first run builds the image and installs dependencies from `package-lock.json`; later runs are cached. If you change dependencies, rebuild with `docker compose build`.

Working directly with Node instead of Docker is possible (`nvm use` then `npm install`), but Docker is the supported local path.

## Preview build (inspection only)

A normal build rests on the neutral surface and never starts a session on its own (FR-1b): opening the app shows a quiet, dim screen until a parent completes the setup gate. To inspect the scene directly, build with `SLOWTIDE_PREVIEW=1`, which auto-starts the forest at the real local time of day and adds the on-screen dev toolbar (time-of-day buttons and the engine view).

```
SLOWTIDE_PREVIEW=1 npm run build && npm run preview   # built preview at http://localhost:4173
```

The flag is read at build time only. A plain `npm run build`, and therefore the deployed site, is unaffected and still ships neutral. This is a development aid: never publish a preview build to the child's device, since auto-start is exactly what FR-1b guards against.

### Testing on a real iPad

The PWA needs a secure (HTTPS) origin for the service worker and Add to Home Screen to work, so a plain LAN address will not do. The quickest route is a temporary tunnel to the local preview server (no account needed):

```
SLOWTIDE_PREVIEW=1 npm run build && npm run preview   # terminal 1: serves on :4173
cloudflared tunnel --url http://localhost:4173        # terminal 2: prints an https URL
```

Open the printed `https://<name>.trycloudflare.com` in Safari on the iPad, then Share > Add to Home Screen and launch it. `preview.allowedHosts` is set to `true` so the tunnel host is accepted. Keep both terminals running for the duration of the test; the URL stops working once the tunnel is closed.

## Structure

```
src/
  engine/    pure TypeScript core: budget curve, levers, session lifecycle (no DOM, no timers, no I/O)
  platform/  the impure edges (storage today; wake lock, audio, PWA glue later)
  app.ts     composition root
public/       manifest, icons, CNAME (custom subdomain)
```

The engine is a pure function of wall-clock time and session config; nothing an interaction does can raise the budget. That single property is what makes exploit-resilience hold and what makes the engine trivially testable by injecting a synthetic clock. See `src/engine/*.test.ts`.

## Deployment

Hosted on GitHub Pages from this public repository. GitHub Actions builds and deploys on every push to `main` (`.github/workflows/deploy.yml`): it runs the full gate, builds with `npm run build`, and publishes `dist/`. The Node version is read from `.nvmrc`. The custom domain is set by `public/CNAME` (`play.slowtide.app`), which Vite copies into `dist/` at build time; point that domain's DNS at GitHub Pages. The Vite `base` stays `/`.

CI is separate: `.github/workflows/ci.yml` runs the full gate (`npm run verify`) on every push and pull request. Enable Pages in the repository settings with source set to "GitHub Actions".
