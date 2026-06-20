/**
 * EndFlourish — renders an end-of-view ornament (vs-sd5.1 polish). The variants
 * live in ./endFlourishes (Band / Dots / Baroque / Ivy); this is the single
 * import site for views. Most views use the default (ACTIVE); a view can opt
 * into a different ornament by passing `variant` (e.g. the Details page uses
 * the crisp "rule & bead" tailpiece as a finished end-of-document mark).
 */

import React from "react";
import { END_FLOURISHES, type EndFlourishVariant } from "./endFlourishes";

// Default ornament. A faded woven band; "dots", "baroque" and "ivy" are also ready.
const ACTIVE: EndFlourishVariant = "band";

export function EndFlourish({ variant = ACTIVE }: { variant?: EndFlourishVariant } = {}): React.ReactElement {
  const Variant = END_FLOURISHES[variant];
  return <Variant />;
}
