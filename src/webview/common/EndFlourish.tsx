/**
 * EndFlourish — a decorative "end of content" ornament (vs-sd5.1 polish).
 *
 * A symmetric baroque flourish: two mirrored acanthus swashes that curl into
 * volutes, flanking a central lozenge-and-bead motif (a nod to "beads"). Drawn
 * in currentColor at low opacity so it reads as a quiet typographic dingbat
 * closing the view, not a UI control. Purely ornamental — aria-hidden.
 */

import React from "react";

// One half of the flourish, sweeping right from the centre (x=150). The left
// half is the same group mirrored, so the ornament is perfectly symmetric.
function FlourishHalf(): React.ReactElement {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round">
      {/* Upper swash curling into a volute */}
      <path d="M150 20 C 171 20 180 9 197 9 C 215 9 219 23 205 24 C 196 24.6 196 15 204 15.6" />
      {/* Lower counter-scroll */}
      <path d="M150 20 C 167 20 173 27 187 27 C 199 27 201 20.5 193 19.6" />
      {/* Acanthus leaf tucked into the upper curl */}
      <path
        d="M197 9 C 201 4.5 208 4.5 211 8 C 207.5 10.5 201 10.5 197 9 Z"
        fill="currentColor"
        stroke="none"
      />
      {/* Punctuating beads along the stem */}
      <circle cx="162" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="178" cy="20" r="1" fill="currentColor" stroke="none" />
    </g>
  );
}

export function EndFlourish(): React.ReactElement {
  return (
    <svg
      className="view-end-flourish"
      viewBox="0 0 300 40"
      width="200"
      height="27"
      role="presentation"
      aria-hidden="true"
    >
      {/* Central lozenge framing a bead */}
      <path
        d="M150 11 L158 20 L150 29 L142 20 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.1}
      />
      <circle cx="150" cy="20" r="2.6" fill="currentColor" />
      {/* Right half, then the same group mirrored to form the left half */}
      <FlourishHalf />
      <g transform="matrix(-1 0 0 1 300 0)">
        <FlourishHalf />
      </g>
    </svg>
  );
}
