# Accessibility Testing

## Approach

Manual source review was used as the primary method, supplemented by
automated scanning — consistent with this project's overall white-box,
manual-first testing philosophy. Two tools were used:

- **pa11y** (HTML_CodeSniffer, WCAG2AA ruleset) against the production
  build (`vite build` + `vite preview`), which loads and evaluates the
  actual rendered DOM in headless Chrome rather than static markup.
- **Manual code review** of form markup (label/input association,
  `aria-label` usage, keyboard focus order) across the highest-traffic
  unauthenticated pages: Landing (`/`), Login (`/login`), and
  Register (`/register`).

Authenticated/role-gated pages (dashboards, booking, vault) were not
included in this pass — scanning them would need a scripted login step,
which was out of scope for this quick pass but is a natural next step.

## Findings

### Fixed

**Footer text contrast — WCAG 1.4.3 (AA), confirmed violation.**
`Landing.tsx`'s footer used `text-gray-400` on a white background
(contrast ratio ≈2.8:1, below the 4.5:1 AA minimum for normal text) —
the light/dark Tailwind classes were accidentally inverted relative to
the pattern used everywhere else in the app (`text-gray-500
dark:text-gray-400`). Fixed to match the established pattern and
re-scanned: **0 errors**, down from 1.

### Investigated and dismissed (false positive)

**Register page role `<select>` — "no value available to an
accessibility API."** pa11y flagged this, but source review shows a
correctly paired `<label htmlFor="role">` / `<select id="role">` — this
is a known false-positive pattern for controlled React `<select>`
elements in some automated scanners. No change made; documented here as
evidence of manual verification rather than blindly trusting tool
output.

### Flagged for manual verification (not hard failures)

The scan's remaining ~9–20 items per page are `warning`/`notice` level,
not confirmed errors — mostly "cannot automatically determine contrast"
flags on elements with CSS transparency or background images (hero
section text, navbar), which HTML_CodeSniffer cannot compute
automatically and requires a human check. Spot-checked visually against
the app's existing Tailwind primary/accent palette (already
dark-mode-aware throughout) — no readability issues observed, but these
remain open items for a full manual contrast audit rather than
confirmed passes.

One structural notice recurs on every page: the navbar's link container
is a `<div>` rather than a `<ul>/<li>` list, which HTML_CodeSniffer
suggests (not requires) for screen-reader navigation semantics
(WCAG 1.3.1, H48). Left as-is — a reasonable follow-up, not a defect.

## Existing accessibility provisions (already in place)

- Skip-to-content link (`#main-content`) on every page, including
  public/unauthenticated ones.
- Semantic landmarks (`<nav>`, `<main>`, `<aside>`) in the app shell.
- `aria-label`s on icon-only/ambiguous controls (password show/hide,
  language/theme toggles, digit inputs on the MFA screen).
- Dark-mode variants throughout, tested as part of this pass.
