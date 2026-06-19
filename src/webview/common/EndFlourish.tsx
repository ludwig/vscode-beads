/**
 * EndFlourish — a decorative "end of content" ornament (vs-sd5.1 polish).
 *
 * A full-width hairline that, at each end, turns downward and curls into a
 * leafy ivy tendril. Built as [leaf cap][flexible rule][leaf cap] so the rule
 * spans the entire available width while the caps stay a fixed size — the line
 * sits near the top and the foliage hangs below it. Drawn in currentColor at
 * low opacity so it reads as a quiet closing dingbat, not a UI control.
 * aria-hidden.
 */

import React from "react";

// One end cap: the rule arrives at the top-left (0,2), dips right, turns down,
// and curls into a small tendril, with two ivy leaves branching off. The right
// cap renders this directly; the left cap mirrors it.
function LeafCap({ flip }: { flip?: boolean }): React.ReactElement {
  return (
    <svg
      className="view-end-cap"
      viewBox="0 0 64 44"
      width="48"
      height="33"
      role="presentation"
      aria-hidden="true"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round">
        {/* Vine: enters level, descends, turns down, curls back into a tendril */}
        <path d="M0 2 C 20 2 36 3 46 13 C 54 21 54 33 45 36 C 38 38.5 33 31 39 27.5" />
        {/* Upper ivy leaf */}
        <path
          d="M42 11 C 45 4 53 4 57 9 C 52 13.5 45 13.5 42 11 Z"
          fill="currentColor"
          stroke="none"
        />
        <path d="M44 10.5 L55 8" strokeWidth={0.8} />
        {/* Lower ivy leaf, hanging off the downturn */}
        <path
          d="M50 22 C 57 23 61 30 58 37 C 52 35.5 48 28 50 22 Z"
          fill="currentColor"
          stroke="none"
        />
        <path d="M51 24 L56 34" strokeWidth={0.8} />
        {/* Tendril terminal dot */}
        <circle cx="40.5" cy="28" r="1.1" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

export function EndFlourish(): React.ReactElement {
  return (
    <div className="view-end-rule" aria-hidden="true">
      <LeafCap flip />
      <span className="view-end-line" />
      <LeafCap />
    </div>
  );
}
