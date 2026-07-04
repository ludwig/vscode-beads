/**
 * StatusPriorityPill Component
 *
 * A joined pill of a bead's type/status/priority. The dependency lists render
 * [status|priority]; the Details header and the Selection card also lead with a
 * type segment. Outer corners are rounded generically (first/last/only-child)
 * so any subset renders correctly.
 *
 * When `onChange` is provided, each present segment becomes an inline
 * click-to-edit control: clicking a segment opens a small dropdown of options
 * in place and picking one commits immediately (no separate edit mode). Without
 * `onChange` it's a static read-only badge (dependency lists, etc.).
 */

import React, { useState, useRef } from "react";
import {
  BeadStatus,
  BeadPriority,
  BeadType,
  statusLabel,
  statusColor,
  TYPE_COLORS,
  TYPE_LABELS,
  PRIORITY_COLORS,
  PRIORITY_TEXT_COLORS,
  UNKNOWN_PRIORITY_COLOR,
  UNKNOWN_PRIORITY_TEXT_COLOR,
} from "../types";
import { ColoredSelectOption } from "./ColoredSelect";
import { TYPE_OPTIONS, STATUS_OPTIONS, PRIORITY_OPTIONS } from "./field-options";
import { useClickOutside } from "../hooks/useClickOutside";

/** Patch emitted when a segment's value changes. */
export interface PillFieldPatch {
  type?: BeadType;
  status?: BeadStatus;
  priority?: BeadPriority;
}

interface StatusPriorityPillProps {
  /** Optional leading type segment (e.g. the header/Selection pill: [type|status|priority]). */
  type?: BeadType;
  status?: BeadStatus;
  priority?: BeadPriority;
  /** When set, each present segment becomes an inline click-to-edit dropdown. */
  onChange?: (patch: PillFieldPatch) => void;
}

/**
 * One editable segment: a click-to-edit pill segment that opens a colored
 * option menu in place. Kept a direct `<span>` child of the pill so the
 * sibling-based outer-corner rounding still applies; the menu is an absolutely
 * positioned child so it escapes the 20px pill band without a wrapper.
 */
function EditablePillSegment<T extends string | number>({
  className,
  label,
  bg,
  textColor,
  value,
  options,
  onSelect,
}: {
  className: string;
  label: string;
  bg?: string;
  textColor?: string;
  value: T;
  options: ColoredSelectOption<T>[];
  onSelect: (value: T) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <span
      ref={ref}
      className={`${className} pill-seg`}
      role="button"
      tabIndex={0}
      aria-haspopup="listbox"
      aria-expanded={open}
      style={{ backgroundColor: bg, color: textColor }}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        } else if (e.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      {label}
      {open && (
        <div className="colored-select-menu dropdown-menu pill-seg-menu" role="listbox">
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              className={`colored-select-option dropdown-item ${o.value === value ? "selected" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(o.value);
                setOpen(false);
              }}
            >
              <span
                className="colored-select-badge"
                style={{ backgroundColor: o.color, color: o.textColor || "#ffffff" }}
              >
                {o.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function StatusPriorityPill({
  type,
  status,
  priority,
  onChange,
}: StatusPriorityPillProps): React.ReactElement | null {
  // Need at least one value to render
  if (!type && !status && priority === undefined) return null;

  const statusText = status ? statusLabel(status) : null;
  const statusBg = status ? statusColor(status) : null;

  const priorityLabel = priority !== undefined ? `P${priority}` : "P?";
  const priorityBgColor = priority !== undefined ? PRIORITY_COLORS[priority] : UNKNOWN_PRIORITY_COLOR;
  const priorityTextColor =
    priority !== undefined ? PRIORITY_TEXT_COLORS[priority] : UNKNOWN_PRIORITY_TEXT_COLOR;

  const editable = !!onChange;

  return (
    <span className={`status-priority-pill${editable ? " editable" : ""}`}>
      {type &&
        (editable ? (
          <EditablePillSegment
            className="pill-type"
            label={TYPE_LABELS[type] ?? type}
            bg={TYPE_COLORS[type]}
            textColor="#fff"
            value={type}
            options={TYPE_OPTIONS}
            onSelect={(v) => onChange!({ type: v })}
          />
        ) : (
          <span className="pill-type" style={{ backgroundColor: TYPE_COLORS[type] }}>
            {TYPE_LABELS[type] ?? type}
          </span>
        ))}
      {status &&
        (editable ? (
          <EditablePillSegment
            className="pill-status"
            label={statusText ?? status}
            bg={statusBg || undefined}
            textColor="#fff"
            value={status}
            options={STATUS_OPTIONS}
            onSelect={(v) => onChange!({ status: v })}
          />
        ) : (
          <span className="pill-status" style={{ backgroundColor: statusBg || undefined }}>
            {statusText}
          </span>
        ))}
      {priority !== undefined &&
        (editable ? (
          <EditablePillSegment
            className="pill-priority"
            label={priorityLabel}
            bg={priorityBgColor}
            textColor={priorityTextColor}
            value={priority}
            options={PRIORITY_OPTIONS}
            onSelect={(v) => onChange!({ priority: v })}
          />
        ) : (
          <span
            className="pill-priority"
            style={{ backgroundColor: priorityBgColor, color: priorityTextColor }}
          >
            {priorityLabel}
          </span>
        ))}
    </span>
  );
}
