/**
 * Shared lightweight right-click menu (the codebase avoids native menus).
 * Renders a fixed-position menu at (x, y); dismisses on outside-click or Escape.
 * Used by the Graph view's bead nodes and the Issues table rows.
 */

import React, { useEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  separatorBefore?: boolean;
  /** Optional leading icon (e.g. an eye/eye-off glyph for the Hide action). */
  icon?: React.ReactNode;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="app-context-menu" style={{ left: x, top: y }} role="menu">
      {items.map((item) => (
        <React.Fragment key={item.label}>
          {item.separatorBefore && <div className="app-context-menu-sep" />}
          <button
            type="button"
            role="menuitem"
            className="app-context-menu-item"
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            {item.icon && <span className="app-context-menu-icon">{item.icon}</span>}
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
