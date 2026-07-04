/**
 * RuleAndBead — a crisp, geometric tailpiece: two hard hairlines flanking a
 * center diamond (a bead), each rule dot-capped at its outer end. Architectural
 * and symmetric — the quiet, modern counterpart to the ornate scrollwork
 * variants. Drawn in currentColor hairlines. Part of the end-flourish library
 * (see ./index).
 */

import React from "react";

export function RuleAndBead(): React.ReactElement {
  return (
    <svg
      className="view-end-flourish view-end-rulebead"
      viewBox="0 0 300 28"
      width="300"
      height="28"
      role="presentation"
      aria-hidden="true"
    >
      {/* Twin hairlines flanking the centre, with the diamond outline between.
          The lines run long; the diamond/bead keep their original small size
          (centre x=150), so widening only lengthens the rules. */}
      <g fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round">
        <path d="M15 14 L136 14" />
        <path d="M164 14 L285 14" />
        <path d="M150 5 L160 14 L150 23 L140 14 Z" />
      </g>
      {/* Center bead, and a small dot capping each rule */}
      <g fill="currentColor" stroke="none">
        <circle cx="150" cy="14" r="2.4" />
        <circle cx="15" cy="14" r="1.4" />
        <circle cx="285" cy="14" r="1.4" />
      </g>
    </svg>
  );
}
