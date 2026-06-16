/**
 * Lightweight right-click menu for graph bead nodes (vs-aml). Webview-side
 * (the codebase avoids native menus); dismisses on outside-click or Escape.
 */

import React, { useEffect, useRef } from "react";

export interface GraphContextMenuItem {
  label: string;
  onSelect: () => void;
  separatorBefore?: boolean;
}

interface GraphContextMenuProps {
  x: number;
  y: number;
  items: GraphContextMenuItem[];
  onClose: () => void;
}

export function GraphContextMenu({ x, y, items, onClose }: GraphContextMenuProps): React.ReactElement {
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
    <div ref={ref} className="graph-context-menu" style={{ left: x, top: y }} role="menu">
      {items.map((item) => (
        <React.Fragment key={item.label}>
          {item.separatorBefore && <div className="graph-context-menu-sep" />}
          <button
            type="button"
            role="menuitem"
            className="graph-context-menu-item"
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
