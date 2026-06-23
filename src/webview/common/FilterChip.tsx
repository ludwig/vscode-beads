/**
 * FilterChip Component
 *
 * Displays a removable filter chip with colored left border accent.
 */

import React from "react";

interface FilterChipProps {
  label: string;
  accentColor?: string;
  /**
   * Marks an exclusion/negated filter (e.g. "¬closed"). Renders the chip with a
   * distinct emphasis so the double-negative reads clearly rather than looking
   * like a positive status pick: a bolded leading "¬" operator + tinted fill
   * (vs-th4z). If the label starts with "¬", that operator is split out.
   */
  negated?: boolean;
  onRemove?: () => void;
}

export function FilterChip({
  label,
  accentColor,
  negated,
  onRemove,
}: FilterChipProps): React.ReactElement {
  const style = accentColor
    ? { "--chip-accent-color": accentColor } as React.CSSProperties
    : undefined;

  // Split a leading "¬" so it can be emphasized independently of the term.
  const op = negated && label.startsWith("¬") ? "¬" : null;
  const term = op ? label.slice(op.length) : label;

  return (
    <span className={`filter-chip${negated ? " filter-chip--negated" : ""}`} style={style}>
      {op && <span className="filter-chip-not" aria-label="not">{op}</span>}
      {term}
      {onRemove && (
        <button onClick={onRemove} title="Remove filter">
          ×
        </button>
      )}
    </span>
  );
}
