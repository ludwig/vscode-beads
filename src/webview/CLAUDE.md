# Webview conventions (src/webview)

Full reference: [`docs/reference/webview-styling.md`](../../docs/reference/webview-styling.md).
The essentials, auto-loaded when working in this directory:

- **Never hardcode `font-size` in px — use the `styles.css` `:root` tokens.**
  Text: `--text-label` (11px, the FLOOR), `--text-sm` (12px), `--text-body`
  (13px), `--text-title` (16px). Badges only: `--badge-font-sm/md/lg`
  (10/11/13px). Sub-floor hardcoded px reads tiny and ignores the user's
  `--vscode-font-size`. Same for color — always `--vscode-*` variables.
- **Components over ad-hoc markup** — reuse `src/webview/common/` (`StatusBadge`,
  `BeadSummary`, …); the bead-rendering family spans several LOD levels.
- **No native HTML controls** — use themed `Dropdown`/`ColoredSelect`/etc.
- **Editing a shared CSS class? Grep its usages first** (`.bead-id`/`.bead-title`
  are shared by the Issues table and the Dashboard) — scope new behavior under a
  modifier, don't change the base.
