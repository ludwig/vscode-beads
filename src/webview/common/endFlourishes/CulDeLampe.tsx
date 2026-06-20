/**
 * CulDeLampe — a printer's tailpiece (the traditional "end of chapter" mark):
 * a small, symmetric ornament that tapers DOWNWARD to a point. Twin shoulder
 * scrolls sweep outward then curl back in and down, converging on a central
 * spine of graduated beads that ends in a pendant drop. Drawn in currentColor
 * hairlines. Part of the end-flourish library (see ./index).
 */

import React from "react";

// Right half, drawn from the central axis (x=60). The left half is this group
// mirrored across x=60, so the tailpiece is perfectly symmetric.
function Half(): React.ReactElement {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round">
      {/* Shoulder swash: out from the centre top, curling up into a terminal volute */}
      <path d="M60 12 C 74 9 82 4 90 8 C 98 12 95 21 87 19 C 81 17.5 84 11 90 13" />
      {/* Inner counter-scroll, doubling the stem with a tighter curl */}
      <path d="M68 12 C 78 14 80 22 72 27" />
      {/* Long sweep from the shoulder inward and down toward the spine */}
      <path d="M74 12 C 80 24 72 37 61 45" />
      {/* A small leaf budding off the sweep */}
      <path d="M70 28 C 75 28 79 31 79 36 C 74 35 71 32 70 28 Z" />
    </g>
  );
}

export function CulDeLampe(): React.ReactElement {
  return (
    <svg
      className="view-end-flourish view-end-culdelampe"
      viewBox="0 0 120 66"
      width="120"
      height="66"
      role="presentation"
      aria-hidden="true"
    >
      {/* Crown: a small lozenge medallion framing a bead at the top centre */}
      <g fill="none" stroke="currentColor" strokeWidth={1}>
        <path d="M60 3 L66 11 L60 19 L54 11 Z" />
      </g>
      <circle cx="60" cy="11" r="2" fill="currentColor" />
      {/* Right half, then the same group mirrored to form the left half */}
      <Half />
      <g transform="matrix(-1 0 0 1 120 0)">
        <Half />
      </g>
      {/* Central spine: graduated beads descending to the terminal pendant drop */}
      <g fill="currentColor" stroke="none">
        <circle cx="60" cy="34" r="2" />
        <circle cx="60" cy="41" r="1.5" />
        <circle cx="60" cy="47" r="1" />
      </g>
      <path d="M60 50 C 62.5 53 62 58 60 62 C 58 58 57.5 53 60 50 Z" fill="currentColor" />
    </svg>
  );
}
