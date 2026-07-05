/**
 * Shared lightweight right-click menu (the codebase avoids native menus).
 * Renders a fixed-position menu at (x, y); dismisses on outside-click or Escape.
 * Used by the Graph view's bead nodes and the Issues table rows.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  separatorBefore?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  // Clamp into the viewport so a right-click near the bottom/right edge (e.g. the
  // last rows of a table) doesn't render the menu off-screen. Measured after
  // mount in a layout effect (runs before paint, so no flicker).
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    let left = x;
    let top = y;
    if (left + w > vw - margin) left = Math.max(margin, vw - w - margin);
    if (top + h > vh - margin) {
      // Not enough room below — flip the menu above the cursor; if that overflows
      // the top too (a very tall menu), clamp to the bottom edge.
      top = y - h >= margin ? y - h : Math.max(margin, vh - h - margin);
    }
    setPos({ left, top });
  }, [x, y, items]);

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
    <div ref={ref} className="app-context-menu" style={{ left: pos.left, top: pos.top }} role="menu">
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
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
