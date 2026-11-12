# English / 简体中文 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task by task.

**Goal:** Provide complete local English / Simplified Chinese UI switching while keeping upstream synchronization straightforward.

**Architecture:** Use i18next and react-i18next, with English source sentences as stable keys (keySeparator and nsSeparator disabled). Chinese dictionaries live under frontend/src/i18n/locales/zh-CN; English resources are derived from the keys, with safe fallback for untranslated upstream text. Components use useTranslation; shared formatting helpers translate at call time. No DOM translation, business-state translation, or component restructuring.

**Tech Stack:** Existing React 19 / Vite / Radix UI, i18next, react-i18next, Node test runner and browser smoke checks.

**Spec:** User-approved design in this conversation, including language persistence, immediate switching, authentication pages, full UI coverage, and easy upstream updates.

## Global Constraints

- All translation assets are bundled for offline and self-hosted use.
- Preserve English source text, original identifiers, server data, user-entered values and business behavior.
- Keep existing files structurally unchanged; use small translation-call diffs.
- Default to browser language (Chinese -> zh-CN, otherwise en); explicit saved choice has priority.
- Storage failures cannot prevent startup or switching. Synchronize document language and other tabs.
- Check missing keys, interpolation mismatches, and new hardcoded UI strings after upstream merges.
- Do not commit, push, publish, or change upstream remotes as part of this request.

## Tasks

- [x] 1. Add tests for locale resolution, English fallback, interpolation, catalog validation, and language persistence; observe failures, implement i18n core and reusable switcher.
- [x] 2. Localize authentication, settings, and autoxpose components in isolated file scopes; maintain auth-settings.json.
- [x] 3. Localize navigation and server summary/batch components; maintain layout-batch.json.
- [x] 4. Localize service, port and health/detail components; maintain service-port.json.
- [x] 5. Integrate header, application dialogs, shared helpers, update UI, and language-aware formatting; maintain app.json and shared.json.
- [x] 6. Add AST-based translation coverage/inventory checks and upstream update documentation without rewriting upstream files.
- [x] 7. Run targeted tests, existing frontend contracts, lint, production build, and browser checks (English/Chinese, persistence, auth, mobile and themes); review diffs and resolve defects.

## Final validation (2026-11-12)

- `npm run test:i18n`: 44 passed; `npm run test:frontend`: 51 passed.
- `npm run i18n:check`: 112 production source files, 6 catalogs, 822 keys, 0 errors, 36 informational manual-review findings for dynamic keys.
- `npm run lint`, frontend production build, and `git diff --check`: passed. Vite reports its advisory for a JavaScript chunk larger than 500 kB.
- Browser smoke checks used a local mock API: English/Chinese switching, search preservation, reload persistence, cross-tab synchronization, auth/setup/password pages, settings, recent release notes, container status labels, light/dark themes, and 390/768/1440 pixel widths. No live backend integration was exercised.
- Scoped review found no remaining blocking localization issues. Temporary browser tabs, mock API, and Vite server were closed after validation.
- Existing behavior observed and traced to unchanged HEAD code: opening container details from a port sets both local `showDetails` and the URL deep link. The first close clears the deep link while `forceOpenDetails` prevents clearing local state, so a second close is needed. This pre-existing interaction is outside localization scope; the localization change does not alter those handlers. Locale changes preserve drawer focus, and final close restores its opener.
