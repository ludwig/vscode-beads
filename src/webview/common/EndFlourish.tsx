/**
 * EndFlourish — renders the currently-selected end-of-view ornament (vs-sd5.1
 * polish). The variants live in ./endFlourishes (Dots / Baroque / Ivy); this is
 * the single import site for views. Swap the active ornament by changing
 * ACTIVE — nothing else needs to move.
 */

import React from "react";
import { END_FLOURISHES, type EndFlourishVariant } from "./endFlourishes";

// Active ornament. Tasteful dots for now; "baroque" and "ivy" are also ready.
const ACTIVE: EndFlourishVariant = "dots";

export function EndFlourish(): React.ReactElement {
  const Variant = END_FLOURISHES[ACTIVE];
  return <Variant />;
}
