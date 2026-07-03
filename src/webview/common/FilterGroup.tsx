/**
 * FilterGroup — a collapsible "filter condition" whose members come from a
 * **seed list** that can be **masked**.
 *
 * Generalized out of the Favorites section (its first instance): Favorites is a
 * condition driven by a seed list (the starred beads) that expands into
 * relatives; toggling a seed's eye **masks** it, dropping it (and its unique
 * relatives) from the expansion. The mask is a property of THIS container, not
 * of the individual seed cards — so the eye lives here, owned by the group,
 * rendered beside each seed. Seed body + trailing control are passed in as
 * render props so the group stays reusable for other seed-based filters.
 *
 * Chrome (collapsible header + count + optional header action) mirrors the
 * `context-section` pattern the panel already uses.
 */

import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { VisibilityEye } from "./VisibilityEye";

interface FilterGroupProps<T> {
  /** The group / condition name (heading). */
  title: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Count beside the title (e.g. seed count); hidden when 0/undefined. */
  count?: number;
  /** Optional header-right control (e.g. a copy-CSV button). */
  headerAction?: React.ReactNode;
  /** The seed list. */
  items: T[];
  getKey: (item: T) => string;
  /** Whether a seed is masked (eye-off, excluded from the expansion). */
  isMasked: (item: T) => boolean;
  /** Flip a seed's mask. */
  onToggleMask: (item: T) => void;
  /** Render the seed body (e.g. the bead card). */
  renderItem: (item: T) => React.ReactNode;
  /** Optional trailing control per seed (e.g. remove-from-group). */
  renderTrailing?: (item: T) => React.ReactNode;
  /** Shown (in place of the list) when there are no seeds. */
  emptyState: React.ReactNode;
}

export function FilterGroup<T,>({
  title,
  collapsed,
  onToggleCollapsed,
  count,
  headerAction,
  items,
  getKey,
  isMasked,
  onToggleMask,
  renderItem,
  renderTrailing,
  emptyState,
}: FilterGroupProps<T>): React.ReactElement {
  return (
    <section className="context-section filter-group">
      <div className="context-section-head">
        <button
          type="button"
          className="context-heading context-heading-toggle"
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <ChevronRight size={13} strokeWidth={2} className="context-heading-chevron" />
          ) : (
            <ChevronDown size={13} strokeWidth={2} className="context-heading-chevron" />
          )}
          <span>{title}</span>
          {count !== undefined && count > 0 && <span className="context-heading-count">{count}</span>}
        </button>
        {headerAction}
      </div>
      {!collapsed &&
        (items.length > 0 ? (
          <div className="filter-group-list">
            {items.map((item) => {
              const masked = isMasked(item);
              return (
                <div key={getKey(item)} className={`filter-group-row${masked ? " is-masked" : ""}`}>
                  {/* Eye is owned by the group and sits beside the seed (a sibling
                      of the card body), so the body can mute while the eye stays
                      crisp — the mask belongs to the container, not the card. */}
                  <VisibilityEye hidden={masked} onToggle={() => onToggleMask(item)} className="filter-group-eye" />
                  <div className="filter-group-item">{renderItem(item)}</div>
                  {renderTrailing?.(item)}
                </div>
              );
            })}
          </div>
        ) : (
          emptyState
        ))}
    </section>
  );
}
