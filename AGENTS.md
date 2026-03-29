# Repository Guidelines

This repository hosts the **gxu.app** download site: a static frontend served by Caddy, plus a small Node.js HTTP service that proxies update/metrics and redirects downloads.

## Project Structure & Module Organization

- `public/`: static site assets (`index.html`, images, icons).
- `service/`: Node.js service (API + download redirect logic).
  - `server.js`: HTTP routing and handlers.
  - `manifest-*.js`: update manifest fetching/validation/signature checks.
  - `stats-store.js`: download count persistence (JSON file).
- `data/`: runtime data files (e.g. download counts JSON).
- `deploy/`: deployment templates (`gxu-app.service`, `gxu-app.Caddyfile`, `gxu-app.env`).
- Root `gxu-app.service` / `gxu-app.Caddyfile`: current deployment snapshots.

## Build, Test, and Development Commands

Node.js is used without a package manager (no `package.json`). Use Node 18+.

- Run service locally:
  - `node service/server.js`
  - Useful env vars: `PORT`, `UPDATE_MANIFEST_URL`, `STATS_FILE`
- Run tests (Node’s built-in test runner):
  - `node --test service/*.test.js`

## Coding Style & Naming Conventions

- JavaScript (CommonJS) in `service/` (`require(...)`, `module.exports`).
- Indentation: 2 spaces; keep lines readable and avoid deep nesting (prefer early returns).
- Naming:
  - Files: `kebab-case.js` (e.g. `manifest-security.js`)
  - Tests: `*.test.js` next to the module under test

## Testing Guidelines

- Framework: `node:test` + `node:assert/strict`.
- Keep tests deterministic (no real network calls); prefer unit tests for validation logic (e.g. URL allow-lists, signature verification).

## Commit & Pull Request Guidelines

- Commit messages follow Conventional Commits (e.g. `fix: ...`, `chore: ...`).
- PRs should include:
  - a short problem statement and scope,
  - notes on how to verify (commands and expected behavior),
  - screenshots when changing `public/` UI.

## Security & Configuration Tips

- Manifest signature verification is configured via env vars:
  - `MANIFEST_PUBLIC_KEY_PEM`, `MANIFEST_SIGNATURE_KEY_ID`, `REQUIRE_MANIFEST_SIGNATURE`
- Restrict remote download/release hosts via `ALLOWED_DOWNLOAD_HOSTS` / `ALLOWED_RELEASE_HOSTS` (comma-separated).
