/**
 * Dots — the minimal end-of-view ornament: three tasteful dots. Quiet and
 * unobtrusive; the default. Part of the end-flourish library (see ./index).
 */

import React from "react";

export function Dots(): React.ReactElement {
  return (
    <div className="view-end-flourish view-end-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}
