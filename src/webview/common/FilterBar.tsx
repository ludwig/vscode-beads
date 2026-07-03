/**
 * FilterBar — the reusable, unified filter bar (Phase 2).
 *
 * Presentational: it renders a `FilterSnapshot` (preset dropdown, Ready /
 * Favorites toggles, active-filter chips, a faceted "+ Filter" menu) plus an
 * optional inherited-scope segment (the extracted `FilterSnapshotRibbon`) in its
 * leading slot, and reports every edit through the bound `ops` callbacks. It
 * owns NO filter state — the host owns the snapshot — so the same component can
 * drive a tab-local sidecar filter today and the panel/Issues filter later.
 *
 * First cut: structured filters only (no search box); the hosting views keep
 * their own search. Faceted counts come from a precomputed `FacetData`.
 */

import React, { useRef, useState } from "react";
import { Rocket, Star } from "lucide-react";
import {
  BeadStatus,
  BeadPriority,
  BeadType,
  FilterSnapshot,
  STATUS_LABELS,
  statusLabel,
  statusColor,
  PRIORITY_COLORS,
  TYPE_LABELS,
  TYPE_COLORS,
  TYPE_SORT_ORDER,
  getTypeSortOrder,
} from "../types";
import { NOT_CLOSED } from "../../backend/filterPredicates";
import { FILTER_PRESETS } from "../filterPresets";
import type { FacetData } from "../facets";
import type { FilterOps } from "../filterSnapshotOps";
import {
  statusValues,
  priorityValues,
  typeValues,
  assigneeValues,
  labelValues,
} from "../filterSnapshotOps";
import { FilterChip } from "./FilterChip";
import { Dropdown, DropdownItem } from "./Dropdown";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { TypeBadge } from "./TypeBadge";
import { AutocompleteInput, AutocompleteOption } from "./AutocompleteInput";
import { FilterSnapshotRibbon } from "./FilterSnapshotRibbon";
import { getLabelColorStyle } from "../utils/label-colors";
import { useClickOutside } from "../hooks/useClickOutside";

// Issue types sorted by TYPE_SORT_ORDER (epic first) — same order the Issues
// table uses.
const ISSUE_TYPES = Object.keys(TYPE_SORT_ORDER).sort(
  (a, b) => getTypeSortOrder(a) - getTypeSortOrder(b),
);

/** Inherited-scope descriptor; omit to render no inherited segment. */
export interface InheritedScope {
  filteredCount: number;
  totalCount: number;
  cleared: boolean;
  onToggle: () => void;
}

interface FilterBarProps {
  snapshot: FilterSnapshot;
  facets: FacetData;
  ops: FilterOps;
  inherited?: InheritedScope;
  /** Result count shown right-aligned in the bar (both forms): "N of M". */
  count?: { shown: number; total: number };
  /** When `true`, render the compact ribbon (minimized) form. */
  collapsed?: boolean;
  /**
   * Toggle expanded ↔ ribbon. When provided, the funnel toggle is rendered and
   * the `collapsed` prop is honored; omit for a non-collapsible bar.
   */
  onToggleCollapsed?: () => void;
  /** View-specific controls rendered on the trailing edge (e.g. Tree fold/column). */
  trailing?: React.ReactNode;
  /** A second, view-specific row under the main bar (e.g. Graph's graph-only filters). */
  extraRow?: React.ReactNode;
}

type MenuPage = "main" | "status" | "priority" | "type" | "assignee" | "label" | null;

export function FilterBar({
  snapshot,
  facets,
  ops,
  inherited,
  count,
  collapsed = false,
  onToggleCollapsed,
  trailing,
  extraRow,
}: FilterBarProps): React.ReactElement {
  const [menu, setMenu] = useState<MenuPage>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenu(null));

  const status = statusValues(snapshot);
  const priority = priorityValues(snapshot);
  const type = typeValues(snapshot);
  const assignee = assigneeValues(snapshot);
  const label = labelValues(snapshot);

  // Facet-count lookups (0 when a value isn't present in the current beads).
  const countIn = (opts: { value: string; count: number }[], v: string): number =>
    opts.find((o) => o.value === v)?.count ?? 0;
  const priorityCount = (p: BeadPriority): number =>
    facets.priorities.find((o) => o.value === p)?.count ?? 0;
  const unassignedCount = countIn(facets.assignees, "__unassigned__");
  const unlabeledCount = countIn(facets.labels, "__unlabeled__");

  const hasActiveFilters =
    status.length + priority.length + type.length + assignee.length + label.length > 0 ||
    snapshot.readyOnly ||
    snapshot.favoritesOnly ||
    snapshot.globalFilter.trim().length > 0;

  // A concise, human-readable list of the active filters, for the collapsed
  // ribbon (e.g. "not closed, p0, ui, Ready"). Mirrors the chip labels.
  const filterTokens: string[] = [];
  if (status.includes(NOT_CLOSED as BeadStatus)) filterTokens.push("not closed");
  else for (const s of status) filterTokens.push(statusLabel(s));
  for (const p of priority) filterTokens.push(`p${p}`);
  for (const t of type) filterTokens.push(TYPE_LABELS[t as BeadType] || t);
  for (const a of assignee) filterTokens.push(a === "__unassigned__" ? "Unassigned" : a);
  for (const l of label) filterTokens.push(l === "__unlabeled__" ? "Unlabeled" : l);
  if (snapshot.readyOnly) filterTokens.push("Ready");
  if (snapshot.favoritesOnly) filterTokens.push("Favorites");

  // Label autocomplete options: distinct labels (minus already-selected), plus
  // the Unlabeled bucket when present and not already selected.
  const labelOptions: AutocompleteOption[] = [];
  if (!label.includes("__unlabeled__") && unlabeledCount > 0) {
    labelOptions.push({ value: "__unlabeled__", label: "Unlabeled", count: unlabeledCount });
  }
  for (const opt of facets.labels) {
    if (opt.value === "__unlabeled__" || label.includes(opt.value)) continue;
    labelOptions.push({ value: opt.value, label: opt.value, count: opt.count });
  }
  const assigneeOptions = facets.assignees.filter(
    (o) => o.value !== "__unassigned__" && !assignee.includes(o.value),
  );

  // The funnel toggle — one affordance across all views: click to expand/collapse
  // the bar, glows blue when filters are set (replaces the old chevron twistie).
  const twistie = onToggleCollapsed && (
    <button
      type="button"
      className={`filter-bar-funnel ${hasActiveFilters ? "has-filters" : ""}`}
      onClick={onToggleCollapsed}
      title={collapsed ? "Expand filters" : "Collapse filters"}
      aria-label={collapsed ? "Expand filters" : "Collapse filters"}
      aria-expanded={!collapsed}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M6 10.5v-1h4v1H6zm-2-3v-1h8v1H4zm-2-3v-1h12v1H2z" />
      </svg>
    </button>
  );

  const countEl = count && (
    <span className="filter-bar-count">
      {count.shown < count.total ? `${count.shown} of ${count.total}` : `${count.total}`}
    </span>
  );

  // Collapsed (ribbon) form: a concise readout of the active filters + the
  // inherited Show-all/Show-filtered toggle + the twistie to expand. When
  // nothing is set, an inviting muted "Add a filter…" affordance (expands on
  // click). No editing surface here.
  if (onToggleCollapsed && collapsed) {
    const inheritedText = inherited
      ? inherited.cleared
        ? `Showing all ${inherited.totalCount}`
        : `Filtered · ${inherited.filteredCount} of ${inherited.totalCount}`
      : null;
    return (
      <>
      <div className="filter-bar filter-bar-collapsed" role="status">
        {twistie}
        <span className="filter-bar-summary">
          {inheritedText && <span className="filter-bar-summary-inherited">{inheritedText}</span>}
          {inheritedText && filterTokens.length > 0 && (
            <span className="filter-bar-summary-sep" aria-hidden="true">·</span>
          )}
          {filterTokens.length > 0 ? (
            <span className="filter-bar-summary-tokens">{filterTokens.join(", ")}</span>
          ) : (
            <button type="button" className="filter-bar-add-hint" onClick={onToggleCollapsed}>
              Add a filter…
            </button>
          )}
        </span>
        {countEl}
        {inherited && (
          <button type="button" className="filter-snapshot-ribbon-btn" onClick={inherited.onToggle}>
            {inherited.cleared ? `Show filtered (${inherited.filteredCount})` : "Show all"}
          </button>
        )}
        </div>
        {/* extraRow stays visible even collapsed — it holds view controls
            (e.g. Graph layout/focus), not filters. */}
        {extraRow && <div className="filter-bar-extra-row">{extraRow}</div>}
      </>
    );
  }

  return (
    <>
    <div className="filter-bar">
      {twistie}
      {inherited && (
        <FilterSnapshotRibbon
          filteredCount={inherited.filteredCount}
          totalCount={inherited.totalCount}
          cleared={inherited.cleared}
          onToggle={inherited.onToggle}
        />
      )}

      <Dropdown
        trigger={FILTER_PRESETS.find((p) => p.id === snapshot.activePreset)?.label || "Custom"}
        className="preset-dropdown"
        triggerClassName="preset-dropdown-btn"
        menuClassName="preset-dropdown-menu"
      >
        {FILTER_PRESETS.map((preset) => (
          <DropdownItem
            key={preset.id}
            className="preset-option"
            active={snapshot.activePreset === preset.id}
            onClick={() => ops.applyPreset(preset.id)}
          >
            {preset.label}
          </DropdownItem>
        ))}
      </Dropdown>

      <button
        type="button"
        className={`ready-toggle ${snapshot.readyOnly ? "active" : ""}`}
        aria-pressed={snapshot.readyOnly}
        onClick={ops.toggleReady}
        title="Show only ready-to-work beads (open, no open blocker). Composes with the other filters."
      >
        {snapshot.readyOnly ? (
          <span className="ready-toggle-glyph ready-toggle-emoji" aria-hidden="true">🚀</span>
        ) : (
          <Rocket size={12} strokeWidth={2.25} className="ready-toggle-glyph" />
        )}
        <span>Ready</span>
      </button>

      <button
        type="button"
        className={`ready-toggle favorites-toggle ${snapshot.favoritesOnly ? "active" : ""}`}
        aria-pressed={snapshot.favoritesOnly}
        onClick={ops.toggleFavoritesOnly}
        title="Show favorited (starred) beads and their relatives (direct dependency neighbors). Composes with the other filters."
      >
        <Star size={12} strokeWidth={2.25} />
        <span>Favorites</span>
      </button>

      {/* Active filter chips */}
      {status.includes(NOT_CLOSED as BeadStatus) ? (
        <FilterChip
          key="status-not-closed"
          label="not closed"
          accentColor={statusColor("open")}
          negated
          onRemove={ops.clearStatus}
        />
      ) : (
        status.map((s) => (
          <FilterChip
            key={`status-${s}`}
            label={statusLabel(s)}
            accentColor={statusColor(s)}
            onRemove={() => ops.removeStatus(s)}
          />
        ))
      )}
      {priority.map((p) => (
        <FilterChip
          key={`priority-${p}`}
          label={`p${p}`}
          accentColor={PRIORITY_COLORS[p]}
          onRemove={() => ops.removePriority(p)}
        />
      ))}
      {type.map((t) => (
        <FilterChip
          key={`type-${t}`}
          label={TYPE_LABELS[t as BeadType] || t}
          accentColor={TYPE_COLORS[t as BeadType]}
          onRemove={() => ops.removeType(t)}
        />
      ))}
      {assignee.map((a) => (
        <FilterChip
          key={`assignee-${a}`}
          label={a === "__unassigned__" ? "Unassigned" : a}
          accentColor="#6b7280"
          onRemove={() => ops.removeAssignee(a)}
        />
      ))}
      {label.map((l) => (
        <FilterChip
          key={`label-${l}`}
          label={l === "__unlabeled__" ? "Unlabeled" : l}
          accentColor={l === "__unlabeled__" ? "#6b7280" : getLabelColorStyle(l).backgroundColor}
          onRemove={() => ops.removeLabel(l)}
        />
      ))}

      {/* Add filter dropdown with faceted counts */}
      <div className="filter-add-wrapper" ref={menuRef}>
        <button className="filter-add-btn" onClick={() => setMenu(menu === "main" ? null : "main")}>
          + Filter
        </button>

        {menu === "main" && (
          <div className="filter-menu">
            <button onClick={() => setMenu("status")}>Status <span className="menu-chevron">›</span></button>
            <button onClick={() => setMenu("priority")}>Priority <span className="menu-chevron">›</span></button>
            <button onClick={() => setMenu("type")}>Type <span className="menu-chevron">›</span></button>
            <button onClick={() => setMenu("assignee")}>Assignee <span className="menu-chevron">›</span></button>
            <button onClick={() => setMenu("label")}>Label <span className="menu-chevron">›</span></button>
          </div>
        )}

        {menu === "status" && (
          <div className="filter-menu">
            {(Object.keys(STATUS_LABELS) as BeadStatus[])
              .filter((s) => !status.includes(s))
              .map((s) => (
                <button key={s} onClick={() => { ops.addStatus(s); setMenu(null); }}>
                  <StatusBadge status={s} size="small" />
                  <span className="facet-count">({countIn(facets.statuses, s)})</span>
                </button>
              ))}
            <button className="back-btn" onClick={() => setMenu("main")}>← Back</button>
          </div>
        )}

        {menu === "priority" && (
          <div className="filter-menu">
            {([0, 1, 2, 3, 4] as BeadPriority[])
              .filter((p) => !priority.includes(p))
              .map((p) => (
                <button key={p} onClick={() => { ops.addPriority(p); setMenu(null); }}>
                  <PriorityBadge priority={p} size="small" />
                  <span className="facet-count">({priorityCount(p)})</span>
                </button>
              ))}
            <button className="back-btn" onClick={() => setMenu("main")}>← Back</button>
          </div>
        )}

        {menu === "type" && (
          <div className="filter-menu">
            {ISSUE_TYPES.filter((t) => !type.includes(t)).map((t) => (
              <button key={t} onClick={() => { ops.addType(t); setMenu(null); }}>
                <TypeBadge type={t as BeadType} size="small" />
                <span className="facet-count">({countIn(facets.types, t)})</span>
              </button>
            ))}
            <button className="back-btn" onClick={() => setMenu("main")}>← Back</button>
          </div>
        )}

        {menu === "assignee" && (
          <div className="filter-menu">
            {!assignee.includes("__unassigned__") && unassignedCount > 0 && (
              <button onClick={() => { ops.addAssignee("__unassigned__"); setMenu(null); }}>
                <span className="assignee-name">Unassigned</span>
                <span className="facet-count">({unassignedCount})</span>
              </button>
            )}
            {assigneeOptions.map((o) => (
              <button key={o.value} onClick={() => { ops.addAssignee(o.value); setMenu(null); }}>
                <span className="assignee-name">{o.value}</span>
                <span className="facet-count">({o.count})</span>
              </button>
            ))}
            {assigneeOptions.length === 0 && unassignedCount === 0 && (
              <span className="filter-menu-empty">No assignees</span>
            )}
            <button className="back-btn" onClick={() => setMenu("main")}>← Back</button>
          </div>
        )}

        {menu === "label" && (
          <div className="filter-menu filter-menu-label">
            <AutocompleteInput
              placeholder="Search labels..."
              options={labelOptions}
              onSelect={(value) => { ops.addLabel(value); setMenu(null); }}
              autoFocus
              showAllOnFocus
            />
            <button className="back-btn" onClick={() => setMenu("main")}>← Back</button>
          </div>
        )}
      </div>

      {hasActiveFilters && (
        <button className="filter-reset" onClick={ops.clearAll}>
          Clear
        </button>
      )}

      {(trailing || countEl) && (
        <span className="filter-bar-trailing">
          {trailing}
          {countEl}
        </span>
      )}
    </div>
    {extraRow && <div className="filter-bar-extra-row">{extraRow}</div>}
    </>
  );
}
