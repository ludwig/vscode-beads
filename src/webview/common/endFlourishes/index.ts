/**
 * End-flourish library — interchangeable "end of content" ornaments for the
 * bottom of a scrollable view. Each is a self-contained, aria-hidden component
 * drawn in currentColor at low opacity. Pick the active one in EndFlourish.tsx
 * (the single import site for views) by changing its ACTIVE constant.
 *
 * Variants:
 * - Band    — interwoven guilloché weave, full-width, fading at both edges
 * - Dots    — three minimal dots (quietest)
 * - Baroque — wide symmetric scrollwork divider with a central medallion
 * - Ivy     — full-width hairline with climbing ivy tendrils at each edge
 */

import type React from "react";
import { Band } from "./Band";
import { Dots } from "./Dots";
import { Baroque } from "./Baroque";
import { Ivy } from "./Ivy";

export { Band, Dots, Baroque, Ivy };

export type EndFlourishVariant = "band" | "dots" | "baroque" | "ivy";

export const END_FLOURISHES: Record<EndFlourishVariant, () => React.ReactElement> = {
  band: Band,
  dots: Dots,
  baroque: Baroque,
  ivy: Ivy,
};
