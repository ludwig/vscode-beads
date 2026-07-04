# Webview conventions (src/webview)

Scoped guidance for the React webview. Loaded when working in this directory;
keeps webview-specific rules out of the always-on root `CLAUDE.md`.

## Styling: use the design tokens — never hardcode px font sizes

`styles.css` defines a small type + badge scale in `:root`. **Always** style
text with these tokens; do not hardcode `font-size` in px.

- Text scale: `--text-label` (11px), `--text-sm` (12px), `--text-body` (13px),
  `--text-title` (16px). **11px is the floor for text** — nothing textual goes
  smaller.
- Badge scale (chips only, not prose): `--badge-font-sm/md/lg`
  (10/11/13px) + `--badge-height-sm/md/lg`. 10px is the only sanctioned
  sub-floor size, and only for compact badges.
- Spacing/radius/transition tokens exist too (`--spacing-*`, `--border-radius`,
  `--transition-*`) — prefer them over ad-hoc px.

Why it matters: hardcoded sub-floor px (8–10px) reads as tiny **and** ignores
the user's `--vscode-font-size`, so the UI won't scale with their editor
settings. This has bitten us (a Details readout shipped with 9.5px labels).

## Other webview rules (see also root CLAUDE.md "Key Patterns")

- **Prefer components over ad-hoc markup** — extract reusable UI into
  `src/webview/common/` (e.g. `StatusBadge`, `BeadSummary`) rather than inline
  spans/classes. The bead-rendering family spans several LOD levels (list rows,
  `BeadSummary` readout, full `DetailsView`); reuse, don't re-invent.
- **No native HTML controls** — use the themed custom components (`Dropdown`,
  `ColoredSelect`, etc.), not raw `<select>`/`<input type=checkbox>`.
- **Editing a base/shared CSS class? Grep its usages first.** `.bead-id` /
  `.bead-title` are shared by the Issues table AND the Dashboard cards; scope
  new behavior under a modifier rather than changing the base.
