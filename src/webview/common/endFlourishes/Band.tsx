/**
 * Band — a delicate guilloché weave: two phase-shifted sine waves interlacing
 * across the full width, drawn as hairlines in currentColor. Tiles horizontally
 * via an SVG pattern and dissolves at both edges (CSS mask), so it reads as a
 * quiet artful rule rather than something interactive. Part of the end-flourish
 * library (see ./index).
 */

import React from "react";

export function Band(): React.ReactElement {
  return (
    <div className="view-end-band" aria-hidden="true">
      <svg
        className="view-end-band-svg"
        height="12"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* One period of the weave (width 32, height 12, centred on y=6). The
              two strands are mirror images, so they cross at every half-period. */}
          <pattern
            id="end-band-weave"
            patternUnits="userSpaceOnUse"
            width="32"
            height="12"
          >
            <path
              d="M0,6 C5,2 11,2 16,6 C21,10 27,10 32,6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M0,6 C5,10 11,10 16,6 C21,2 27,2 32,6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </pattern>
        </defs>
        <rect width="100%" height="12" fill="url(#end-band-weave)" />
      </svg>
    </div>
  );
}
