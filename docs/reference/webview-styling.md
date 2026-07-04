# Webview styling conventions

Reference for styling the React webview (`src/webview`). The short version is
auto-surfaced to agents via `src/webview/CLAUDE.md`; this is the full doc.

## Use the design tokens — never hardcode px font sizes

`src/webview/styles.css` defines a small, deliberate scale in `:root`. Style
text with these tokens; do not hardcode `font-size` in px.

### Text scale

| Token           | Size | Use                                    |
| --------------- | ---- | -------------------------------------- |
| `--text-label`  | 11px | tracked-out uppercase section captions |
| `--text-sm`     | 12px | secondary / chrome text                |
| `--text-body`   | 13px | descriptions, comments, prose          |
| `--text-title`  | 16px | the Details title anchor               |

**11px (`--text-label`) is the floor for text — nothing textual goes smaller.**

### Badge scale (chips only, not prose)

| Token                              | Size          |
| ---------------------------------- | ------------- |
| `--badge-font-sm` / `-md` / `-lg`  | 10 / 11 / 13px |
| `--badge-height-sm` / `-md` / `-lg`| 20 / 20 / 24px |

10px (`--badge-font-sm`) is the **only** sanctioned sub-floor size, and only for
compact badges (`StatusBadge`/`PriorityBadge` and the like) — never for prose.

### Other tokens

Spacing (`--spacing-xs…xl`), radius (`--border-radius`, `--badge-radius-*`),
transitions (`--transition-fast/normal`), and the accent (`--beads-accent`).
Prefer them over ad-hoc px.

### Why it matters

Hardcoded sub-floor px (8–10px) reads as tiny **and** ignores the user's
`--vscode-font-size`, so the UI won't scale with their editor settings. This has
bitten us — a Details readout shipped with 9.5px labels and an 8px emoji glyph.
Theme colors: always use VS Code CSS variables (`--vscode-*`), never literal
colors, so light/dark and custom themes work.

## Components over ad-hoc markup

Extract reusable UI into `src/webview/common/` (e.g. `StatusBadge`,
`PriorityBadge`, `BeadSummary`) rather than inline spans with class names. The
bead-rendering family spans several levels of detail — list rows (id + title),
the `BeadSummary` readout (medium LOD), and the full `DetailsView` — so reuse
the right member rather than re-inventing another one-off.

## No native HTML controls

Don't use native `<select>`, `<input type="checkbox">`, etc. Use the themed
custom components (`Dropdown`, `ColoredSelect`, …) for consistent VS Code styling.

## Editing a base/shared CSS class? Grep its usages first

`.bead-id` / `.bead-title` are shared by the Issues table AND the Dashboard
cards; a global change there has regressed the Dashboard before. When changing
default behavior of a shared class, scope the new behavior under a modifier
(e.g. `.beads-table.compact`) and leave the base untouched.
