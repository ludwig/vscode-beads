/**
 * EndFlourish — a decorative "end of content" ornament (vs-sd5.1 polish).
 *
 * A wide, symmetric baroque flourish: each half sends a primary swash curling
 * into a large terminal volute, with a secondary inner scroll, acanthus leaves,
 * a fine upper tendril, and a row of graduated beads along the stem — all
 * mirrored around a central medallion-and-lozenge cartouche framing a bead (a
 * nod to "beads"). Drawn in currentColor at low opacity so it reads as a quiet
 * typographic dingbat closing the view, not a UI control. aria-hidden.
 */

import React from "react";

// One half of the flourish, sweeping right from the centre (x=220). The left
// half is this same group mirrored, so the ornament is perfectly symmetric.
function FlourishHalf(): React.ReactElement {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round">
      {/* Primary swash curling into a large terminal volute */}
      <path d="M220 24 C 252 24 264 10 290 10 C 318 10 325 31 305 32 C 289 32.8 289 16 304 16.6" />
      {/* Secondary inner scroll, doubling the stem with a tighter curl */}
      <path d="M250 24 C 268 24 276 15 292 16 C 305 16.8 306 26 296 25.6" />
      {/* Lower counter-scroll mirroring the upper sweep */}
      <path d="M220 24 C 246 24 254 35 273 35 C 290 35 293 24.5 280 23.6" />
      {/* Fine upper tendril ending in a dot */}
      <path d="M264 15 C 276 6 289 4 299 8" />
      <circle cx="300" cy="7.6" r="1.1" fill="currentColor" stroke="none" />
      {/* Acanthus leaves tucked into the curls */}
      <path
        d="M290 10 C 295 3 306 3 311 8.5 C 304 12 296 12 290 10 Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M273 35 C 278 41 287 41 291 36 C 286 33.5 279 33.5 273 35 Z"
        fill="currentColor"
        stroke="none"
      />
      {/* Graduated beads marching out along the stem */}
      <circle cx="236" cy="24" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="252" cy="24" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="266" cy="24" r="0.9" fill="currentColor" stroke="none" />
    </g>
  );
}

export function EndFlourish(): React.ReactElement {
  return (
    <svg
      className="view-end-flourish"
      viewBox="0 0 440 48"
      width="380"
      height="41"
      role="presentation"
      aria-hidden="true"
    >
      {/* Central cartouche: a medallion + lozenge framing a bead, with four
          radiating points. */}
      <g fill="none" stroke="currentColor" strokeWidth={1}>
        <path d="M220 9 L235 24 L220 39 L205 24 Z" />
        <circle cx="220" cy="24" r="6.5" />
      </g>
      <circle cx="220" cy="24" r="2.8" fill="currentColor" />
      <g fill="currentColor" stroke="none">
        <circle cx="220" cy="11.5" r="1" />
        <circle cx="220" cy="36.5" r="1" />
        <circle cx="207.5" cy="24" r="1" />
        <circle cx="232.5" cy="24" r="1" />
      </g>
      {/* Right half, then the same group mirrored to form the left half */}
      <FlourishHalf />
      <g transform="matrix(-1 0 0 1 440 0)">
        <FlourishHalf />
      </g>
    </svg>
  );
}
