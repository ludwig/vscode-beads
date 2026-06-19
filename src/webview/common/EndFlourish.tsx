/**
 * EndFlourish — a decorative "end of content" ornament (vs-sd5.1 polish).
 *
 * A full-width hairline that, at each end, breaks into a climbing ivy tendril —
 * a short shoot curling UP and a longer one curling DOWN (≈1:2), each tipped
 * with a leaf. Built as [leaf cap][flexible rule][leaf cap] so the rule spans
 * the entire width while the caps stay a fixed size, hugging the edges. Drawn
 * in currentColor at low opacity as a quiet closing dingbat. aria-hidden.
 *
 * Geometry note: the rule enters each cap at y=20 of a 0..60 viewBox (one third
 * down), so the foliage reaches ~15 units up and ~30 down — hence the line's
 * margin-top in CSS is tuned to that same one-third entry point.
 */

import React from "react";

// One end cap: the rule arrives at the left at y=20, then forks into an upward
// shoot and a longer downward curl, each ending in a leaf. The right cap renders
// this directly; the left cap mirrors it.
function LeafCap({ flip }: { flip?: boolean }): React.ReactElement {
  return (
    <svg
      className="view-end-cap"
      viewBox="0 0 72 60"
      width="54"
      height="45"
      role="presentation"
      aria-hidden="true"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round">
        {/* Main vine: runs in level, then the longer downward curl + tendril */}
        <path d="M0 20 C 26 20 42 21 51 29 C 58 35 58 49 49 52 C 42 54 37 46 43 42" />
        {/* Shorter upward shoot */}
        <path d="M46 25 C 49 14 57 10 64 13" />
        {/* Upper leaf, tipping the upward shoot */}
        <path
          d="M58 13 C 61 6 69 6 72 11 C 67 15 60 15 58 13 Z"
          fill="currentColor"
          stroke="none"
        />
        <path d="M60 13 L70 10" strokeWidth={0.8} />
        {/* Lower leaf, hanging off the downward curl */}
        <path
          d="M52 38 C 59 39 63 47 60 53 C 55 51 51 43 52 38 Z"
          fill="currentColor"
          stroke="none"
        />
        <path d="M53 40 L58 50" strokeWidth={0.8} />
        {/* Tendril terminal dot */}
        <circle cx="44.5" cy="42.5" r="1.1" fill="currentColor" stroke="none" />
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
