/**
 * SplitButton (vs-zj9g)
 *
 * A primary button that performs the last-selected action, paired with a
 * chevron that opens a menu of alternatives. Picking an alternative performs it
 * AND becomes the new primary — the button changes identity on demand. The
 * choice is persisted in the webview state (keyed by `persistKey`) so it
 * survives reloads — the behavior VS Code's native view/title bars can't do
 * (see vs-w2t4). Reuses the shared Dropdown/DropdownItem primitives.
 */

import React, { useCallback, useState } from "react";
import { ChevronDown } from "lucide-react";
import { vscode } from "../types";
import { Dropdown, DropdownItem } from "./Dropdown";

export interface SplitButtonOption {
  /** Stable id, used to persist the last choice. */
  id: string;
  /** Menu label. */
  label: string;
  /** Icon shown on the primary button (when current) and beside the menu label. */
  icon?: React.ReactNode;
  /** Primary-button tooltip when this option is current. */
  title?: string;
  /** Action to run (primary click, or when chosen from the menu). */
  onSelect: () => void;
}

interface SplitButtonProps {
  /** Stable key for persisting the last-picked option in webview state. */
  persistKey: string;
  options: SplitButtonOption[];
  /** Option to start on when nothing is persisted (defaults to the first). */
  defaultOptionId?: string;
  className?: string;
}

const STATE_PREFIX = "splitButton:";

function readPersisted(persistKey: string): string | null {
  const state = (vscode.getState() as Record<string, unknown> | undefined) ?? {};
  const value = state[STATE_PREFIX + persistKey];
  return typeof value === "string" ? value : null;
}

function writePersisted(persistKey: string, id: string): void {
  // Merge into the shared state blob so we don't clobber other persisted UI.
  const prev = (vscode.getState() as Record<string, unknown> | undefined) ?? {};
  vscode.setState({ ...prev, [STATE_PREFIX + persistKey]: id });
}

export function SplitButton({
  persistKey,
  options,
  defaultOptionId,
  className = "",
}: SplitButtonProps): React.ReactElement | null {
  const [selectedId, setSelectedId] = useState<string>(() => {
    const persisted = readPersisted(persistKey);
    if (persisted && options.some((o) => o.id === persisted)) return persisted;
    if (defaultOptionId && options.some((o) => o.id === defaultOptionId)) return defaultOptionId;
    return options[0]?.id ?? "";
  });

  const choose = useCallback(
    (option: SplitButtonOption) => {
      setSelectedId(option.id);
      writePersisted(persistKey, option.id);
      option.onSelect();
    },
    [persistKey],
  );

  const current = options.find((o) => o.id === selectedId) ?? options[0];
  if (!current) return null;

  return (
    <span className={`split-button ${className}`}>
      <button
        type="button"
        className="split-button-primary icon-btn header-icon-btn"
        title={current.title ?? current.label}
        aria-label={current.label}
        onClick={() => current.onSelect()}
      >
        {current.icon}
      </button>
      <Dropdown
        trigger={<ChevronDown size={11} strokeWidth={2.5} />}
        showChevron={false}
        triggerClassName="split-button-chevron icon-btn header-icon-btn"
        menuPlacement="bottom-end"
        title="More actions"
      >
        {options.map((option) => (
          <DropdownItem key={option.id} onClick={() => choose(option)}>
            <span className="split-button-menu-item">
              {option.icon}
              <span>{option.label}</span>
              {option.id === current.id && <span className="split-button-check">✓</span>}
            </span>
          </DropdownItem>
        ))}
      </Dropdown>
    </span>
  );
}
