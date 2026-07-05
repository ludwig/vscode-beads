/**
 * Shared field option arrays for the editable bead fields (type/status/priority).
 *
 * One source of truth for the ColoredSelect-style option lists so the Details
 * editor and the inline-editable pill (EditablePill / FieldGroup) render the
 * same choices with the same colors. Sorted the same way they display.
 */

import { ColoredSelectOption } from "./ColoredSelect";
import {
  BeadType,
  BeadStatus,
  BeadPriority,
  BuiltInStatus,
  TYPE_LABELS,
  TYPE_COLORS,
  getTypeSortOrder,
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_COLORS,
} from "../types";

// Type options, sorted by TYPE_SORT_ORDER.
export const TYPE_OPTIONS: ColoredSelectOption<BeadType>[] = (Object.keys(TYPE_LABELS) as BeadType[])
  .sort((a, b) => getTypeSortOrder(a) - getTypeSortOrder(b))
  .map((t) => ({
    value: t,
    label: TYPE_LABELS[t],
    color: TYPE_COLORS[t],
  }));

export const STATUS_OPTIONS: ColoredSelectOption<BeadStatus>[] = (Object.keys(STATUS_LABELS) as BuiltInStatus[]).map(
  (s) => ({
    value: s,
    label: STATUS_LABELS[s],
    color: STATUS_COLORS[s],
  })
);

export const PRIORITY_OPTIONS: ColoredSelectOption<BeadPriority>[] = ([0, 1, 2, 3, 4] as BeadPriority[]).map((p) => ({
  value: p,
  label: `P${p}`,
  color: PRIORITY_COLORS[p],
  textColor: p === 2 ? "#1a1a1a" : "#ffffff", // dark text on yellow (P2)
}));
