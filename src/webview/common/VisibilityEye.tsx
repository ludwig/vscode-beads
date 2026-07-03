/**
 * VisibilityEye — the per-bead visibility toggle (Photoshop-layers "eye").
 *
 * The first genuinely-shared bead sub-component: today each view hand-rolls its
 * own bead markup and only shares CSS classes, so this owns the eye/eye-off
 * affordance (glyph + a11y + click isolation) in ONE place for every surface
 * that renders a bead. The `hidden` boolean is the single source of truth for
 * both this glyph and the caller's left-edge stripe (`.is-hidden`), keeping the
 * two visual channels in lockstep off one prop.
 *
 * `onToggle` fires on click with propagation stopped, so it's safe to drop
 * inside a clickable row/card without triggering the parent's select/open.
 */

import React from "react";
import { Eye, EyeOff } from "lucide-react";

interface VisibilityEyeProps {
  /** True when the bead is hidden (eye-off, excluded from expansion). */
  hidden: boolean;
  /** Flip the bead's hidden state. Called with click propagation already stopped. */
  onToggle: () => void;
  /** Glyph size in px (default 14). */
  size?: number;
  /** Extra class for surface-specific tweaks (e.g. a card-only hover rule). */
  className?: string;
}

export function VisibilityEye({ hidden, onToggle, size = 14, className }: VisibilityEyeProps): React.ReactElement {
  return (
    <button
      type="button"
      className={`bead-eye-toggle${hidden ? " is-hidden" : ""}${className ? ` ${className}` : ""}`}
      title={hidden ? "Hidden — click to show in views" : "Visible — click to hide from views"}
      aria-label={hidden ? "Show in views" : "Hide from views"}
      aria-pressed={hidden}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {hidden ? <EyeOff size={size} strokeWidth={2} /> : <Eye size={size} strokeWidth={2} />}
    </button>
  );
}
