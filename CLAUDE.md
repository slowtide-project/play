# Slowtide — Claude Code guide

Slowtide is a bedtime wind-down PWA. A single hidden "arousal budget" decays over a parent-set session (60 or 90 min), and every sensory and interaction parameter reads from it.

This repository is the public app code. The product concept, functional requirements, engine design, and engineering standards are maintained privately by the project owner and are not part of this repo. They are the source of truth; consult them (outside this repo) before non-trivial work. The invariants below capture the constraints that must always hold in the code.

## Invariants — never break these

1. The arousal budget is a **pure function of wall-clock time and session config**. No code path from a child interaction may change it (NFR-3, FR-22, FR-47).
2. **Nothing visible** to the child may reveal session progress: no clocks, timers, progress bars, level counters, or phase markers (NFR-1).
3. **No open-ended content**: no browsing, search, external links, or infinite feeds (NFR-2).
4. **Each session starts fresh** — no arousal budget, curve position, or toy state carries from a previous session. Only parent defaults persist, as setup pre-fills (FR-1a, D-6).
5. A crash or reload **within** a live session resumes at the correct wall-clock position; once the duration has elapsed the session is over, not resumed (FR-6).
6. **Offline-first**: the full session works with no network. No network calls during play (NFR-8).
7. **Fail quiet and dim**: any error resolves to the lowest-arousal safe state or the neutral surface, never bright or loud (NFR-11, FR-28).
8. Motion/flashing comply with **WCAG 2.3** and honour `prefers-reduced-motion`; volume, brightness, and motion never exceed parent ceilings, enforced centrally (NFR-5, FR-12).
9. **No accounts, no analytics, no third-party tracking SDKs** (NFR-10).

## Architecture

- `src/engine/` — pure TypeScript core (budget curve, levers, session lifecycle). No DOM, no timers, no I/O. Depends on nothing in the app.
- `src/render/` — canvas surface: the animation-speed-throttled rAF loop, low-frequency budget resampling, wall-clock resume, and the `Toy` contract (`types.ts`, `frame.ts`).
- `src/toys/` — the toy box (`toy-box.ts`), the menu chooser (`menu.ts`), and the worlds. Worlds are calm, muted, shallow-2.5D atmospheric landscapes you pan across and walk through (D-8); the forest (`forest-world.ts`, `landscape-model.ts`) is the first. Shared colour helpers in `colour.ts`. Each toy reads engine output only, plus `ToyFrame.timeOfDay`.
- `src/parent/` — parent gate and session-setup UI (the only entry into a session, FR-1).
- `src/platform/` — the impure edges: storage, wake lock, audio, PWA glue.
- `src/app.ts` — composition root.

Dependency rule: `engine` imports nothing from the rest of the app; `render` imports nothing from `toys`; only `platform` touches Web APIs.

Two axes (D-8, D-9): the scene's **light** follows the real local clock (`daylightAtHour`/`timeOfDay`, in `render/frame.ts`, passed on the frame); the hidden **budget** winds down the **activity** (motion, forward amble, interaction, reward). Visual style is atmospheric landscapes, not the flat Pok Pok style (trialled and rejected); the hairdressing anchor toy of D-1/FR-23 is superseded.

## Commands (Docker only)

The local supported path is Docker; do not assume Node is installed on the host. Run npm scripts inside the containers:

```
docker compose up dev                            # Vite dev server at http://localhost:5173
docker compose run --rm ci                       # full gate (npm run verify)
docker compose run --rm app npm run test         # any one-off script, e.g. test / lint / typecheck
docker compose run --rm app npm run test:watch   # watch mode
docker compose --profile preview up --build preview  # built PWA at http://localhost:8080
```

The npm scripts themselves (run inside the container): `dev`, `test`, `test:watch`, `test:coverage`, `typecheck`, `lint`, `format`, `format:check`, `build`, `preview`, and `verify` (the full gate).

## Before you finish any change (Definition of Done)

Run and pass: `docker compose run --rm ci` (equivalently `npm run verify`: typecheck, lint, format:check, test, build).
New logic has tests. Any touched invariant above has a test proving it still holds. User-facing copy is British English. New runtime dependencies are justified. If behaviour described in a spec doc changed, update that doc (the specs and Architecture Decision Records live in the private `slowtide-project/spec` repo, not here) in the same change.

## Conventions

TypeScript strict, no `any`. Files `kebab-case`, types `PascalCase`, functions `camelCase`. Public engine APIs have explicit return types and TSDoc. Small PRs, Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). CI must pass before merge.

## Deployment

Hosted on GitHub Pages from this public repo. GitHub Actions builds and deploys on push to `main` (`.github/workflows/deploy.yml`: full gate, `npm run build`, publish `dist`, Node from `.nvmrc`); the custom domain is set by `public/CNAME` (`play.slowtide.app`). Vite `base` stays `/`. CI (`.github/workflows/ci.yml`) runs the full gate on push/PR but does not deploy. The repo is public, so no spec or other confidential material lives in it; those are kept privately by the owner.
