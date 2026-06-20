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
      viewBox="0 0 220 28"
      width="220"
      height="28"
      role="presentation"
      aria-hidden="true"
    >
      {/* Twin hairlines flanking the centre, with the diamond outline between */}
      <g fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round">
        <path d="M30 14 L96 14" />
        <path d="M124 14 L190 14" />
        <path d="M110 5 L120 14 L110 23 L100 14 Z" />
      </g>
      {/* Center bead, and a small dot capping each rule */}
      <g fill="currentColor" stroke="none">
        <circle cx="110" cy="14" r="2.4" />
        <circle cx="30" cy="14" r="1.4" />
        <circle cx="190" cy="14" r="1.4" />
      </g>
    </svg>
  );
}
