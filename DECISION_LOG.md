# Decision log

## 2026-10-31 — Selected lightweight simulation dashboard approach

The project was initialized as a Vite React app because it provides a quick local application workflow and matches the requirement for a polished front-end dashboard without a backend. Recharts and Lucide React were added for charts and icons.

## Decision: keep the app browser-only and local-first

The instructions explicitly request a software simulation and prohibit claims of real hardware. The app therefore generates reading updates in-browser, saves state in LocalStorage, and uses simulated offline-first logic without pretending to perform actual cloud synchronization.

## Decision: keep thresholds as demonstration defaults

Temperature warning and critical limits are configurable in the UI, but labeled as demonstration settings that must be validated before field deployment. This avoids inventing scientifically validated produce-specific thresholds.

## Alternative considered: full backend app shell

A full-stack implementation was rejected because the brief requires a local demonstration environment and no backend dependencies. The browser-only approach is sufficient, reproducible, and easier to validate locally.

## Risk and remaining limitations

- The project still relies on simulated values rather than real operational data.
- Alert deduplication is intentionally lightweight and based on category and acknowledgement state.
- The dashboard is fit for demonstration and operator training, not production field deployment.
