/**
 * Pure reducer-style transforms on a `FilterSnapshot` (unified filter bar,
 * Phase 2). Ported from `IssuesView`'s inline handlers so the new reusable
 * `FilterBar` mutates a snapshot with identical semantics:
 *
 *  - `add*` is idempotent — adding a value already present returns the snapshot
 *    unchanged (mirrors IssuesView, which only touched state inside `if (!present)`).
 *  - `remove*` drops the value, and removes the whole column entry when the last
 *    value goes; it clears the active preset (the filter is now "custom").
 *  - `applyPreset` replaces the `status` column with the preset's status list
 *    (or drops it) and records the preset id.
 *  - `clearAll` empties everything and selects the "all" preset.
 *
 * Every function returns a NEW snapshot; none mutate the input. React-free.
 */

import type { FilterSnapshot, BeadStatus, BeadPriority } from "../shared/contract";
import { NOT_CLOSED } from "../backend/filterPredicates";
import { FILTER_PRESETS } from "./filterPresets";

/** A blank snapshot — nothing narrows (⇒ `resolveScope` returns `null`). */
export function emptyFilterSnapshot(): FilterSnapshot {
  return {
    columnFilters: [],
    globalFilter: "",
    activePreset: "",
    readyOnly: false,
    favoritesOnly: false,
  };
}

// --- Column value accessors -------------------------------------------------

const col = (s: FilterSnapshot, id: string): unknown[] =>
  (s.columnFilters.find((f) => f.id === id)?.value as unknown[] | undefined) ?? [];

/** Replace (or drop, when empty) a single column's value list. */
const withCol = (s: FilterSnapshot, id: string, values: unknown[]): FilterSnapshot => {
  const others = s.columnFilters.filter((f) => f.id !== id);
  return {
    ...s,
    columnFilters: values.length > 0 ? [...others, { id, value: values }] : others,
  };
};

export const statusValues = (s: FilterSnapshot): BeadStatus[] => col(s, "status") as BeadStatus[];
export const priorityValues = (s: FilterSnapshot): BeadPriority[] => col(s, "priority") as BeadPriority[];
export const typeValues = (s: FilterSnapshot): string[] => col(s, "type") as string[];
export const assigneeValues = (s: FilterSnapshot): string[] => col(s, "assignee") as string[];
export const labelValues = (s: FilterSnapshot): string[] => col(s, "labels") as string[];

// --- Presets ----------------------------------------------------------------

export function applyPreset(s: FilterSnapshot, presetId: string): FilterSnapshot {
  const preset = FILTER_PRESETS.find((p) => p.id === presetId);
  if (!preset) return s;
  return { ...withCol(s, "status", preset.statuses), activePreset: presetId };
}

// --- Status (special: the ¬closed sentinel is dropped when picking a concrete status) ---

export function addStatus(s: FilterSnapshot, status: BeadStatus): FilterSnapshot {
  const base = statusValues(s).filter((v) => v !== NOT_CLOSED);
  if (base.includes(status)) return s; // idempotent
  return { ...withCol(s, "status", [...base, status]), activePreset: "" };
}

export function removeStatus(s: FilterSnapshot, status: BeadStatus): FilterSnapshot {
  return { ...withCol(s, "status", statusValues(s).filter((v) => v !== status)), activePreset: "" };
}

/** Clear the status filter entirely — equivalent to the "All" preset. */
export function clearStatus(s: FilterSnapshot): FilterSnapshot {
  return { ...withCol(s, "status", []), activePreset: "all" };
}

// --- Priority / Type / Assignee / Label (uniform add/remove) ----------------

export function addPriority(s: FilterSnapshot, p: BeadPriority): FilterSnapshot {
  if (priorityValues(s).includes(p)) return s;
  return { ...withCol(s, "priority", [...priorityValues(s), p]), activePreset: "" };
}
export function removePriority(s: FilterSnapshot, p: BeadPriority): FilterSnapshot {
  return { ...withCol(s, "priority", priorityValues(s).filter((v) => v !== p)), activePreset: "" };
}

export function addType(s: FilterSnapshot, t: string): FilterSnapshot {
  if (typeValues(s).includes(t)) return s;
  return { ...withCol(s, "type", [...typeValues(s), t]), activePreset: "" };
}
export function removeType(s: FilterSnapshot, t: string): FilterSnapshot {
  return { ...withCol(s, "type", typeValues(s).filter((v) => v !== t)), activePreset: "" };
}

export function addAssignee(s: FilterSnapshot, a: string): FilterSnapshot {
  if (assigneeValues(s).includes(a)) return s;
  return { ...withCol(s, "assignee", [...assigneeValues(s), a]), activePreset: "" };
}
export function removeAssignee(s: FilterSnapshot, a: string): FilterSnapshot {
  return { ...withCol(s, "assignee", assigneeValues(s).filter((v) => v !== a)), activePreset: "" };
}

export function addLabel(s: FilterSnapshot, l: string): FilterSnapshot {
  if (labelValues(s).includes(l)) return s;
  return { ...withCol(s, "labels", [...labelValues(s), l]), activePreset: "" };
}
export function removeLabel(s: FilterSnapshot, l: string): FilterSnapshot {
  return { ...withCol(s, "labels", labelValues(s).filter((v) => v !== l)), activePreset: "" };
}

// --- Boolean toggles + clear ------------------------------------------------

export function toggleReady(s: FilterSnapshot): FilterSnapshot {
  return { ...s, readyOnly: !s.readyOnly };
}
export function toggleFavoritesOnly(s: FilterSnapshot): FilterSnapshot {
  return { ...s, favoritesOnly: !s.favoritesOnly };
}

export function clearAll(_s: FilterSnapshot): FilterSnapshot {
  return { ...emptyFilterSnapshot(), activePreset: "all" };
}

/**
 * The callback surface a `FilterBar` host binds to the pure transforms above.
 * (Plain function type — no React — so it can be declared alongside the ops.)
 */
export interface FilterOps {
  applyPreset(id: string): void;
  addStatus(s: BeadStatus): void;
  removeStatus(s: BeadStatus): void;
  clearStatus(): void;
  addPriority(p: BeadPriority): void;
  removePriority(p: BeadPriority): void;
  addType(t: string): void;
  removeType(t: string): void;
  addLabel(l: string): void;
  removeLabel(l: string): void;
  addAssignee(a: string): void;
  removeAssignee(a: string): void;
  toggleReady(): void;
  toggleFavoritesOnly(): void;
  clearAll(): void;
}
