import { useState, useEffect, useMemo } from "react";
import { SortingState, VisibilityState, ColumnOrderState } from "@tanstack/react-table";
import { vscode } from "../types";

/**
 * Persisted column state for TanStack Table.
 */
export interface ColumnState {
  sorting: SortingState;
  columnVisibility: VisibilityState;
  columnOrder: ColumnOrderState;
}

interface PersistedState {
  sorting?: SortingState;
  columnVisibility?: VisibilityState;
  columnOrder?: ColumnOrderState;
  compact?: boolean;
}

interface UseColumnStateOptions {
  /** Default sorting if none persisted */
  defaultSorting?: SortingState;
  /** Default column visibility if none persisted */
  defaultVisibility?: VisibilityState;
  /** Default column order if none persisted */
  defaultOrder?: ColumnOrderState;
  /** Default compact (packed rows) mode if none persisted */
  defaultCompact?: boolean;
}

interface UseColumnStateReturn {
  sorting: SortingState;
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
  columnVisibility: VisibilityState;
  setColumnVisibility: React.Dispatch<React.SetStateAction<VisibilityState>>;
  columnOrder: ColumnOrderState;
  setColumnOrder: React.Dispatch<React.SetStateAction<ColumnOrderState>>;
  /** Packed-rows mode (id + title on one line, tighter padding) */
  compact: boolean;
  setCompact: React.Dispatch<React.SetStateAction<boolean>>;
  /** Reset visibility to defaults */
  resetVisibility: () => void;
  /** Reset sorting to the default (clears a persisted/stuck sort) */
  resetSorting: () => void;
}

/**
 * Hook to manage TanStack Table column state with VS Code webview persistence.
 *
 * - Loads saved state from vscode.getState() on mount
 * - Merges with defaults for new columns
 * - Saves to vscode.setState() on changes
 *
 * @example
 * const {
 *   sorting, setSorting,
 *   columnVisibility, setColumnVisibility,
 *   columnOrder, setColumnOrder,
 *   resetVisibility,
 * } = useColumnState({
 *   defaultSorting: [{ id: "updatedAt", desc: true }],
 *   defaultVisibility: { labels: false, assignee: false },
 * });
 */
export function useColumnState(options: UseColumnStateOptions = {}): UseColumnStateReturn {
  const {
    defaultSorting = [],
    defaultVisibility = {},
    defaultOrder = [],
    defaultCompact = false,
  } = options;

  // Load persisted state once on mount
  const savedState = useMemo(() => vscode.getState() as PersistedState | undefined, []);

  const [sorting, setSorting] = useState<SortingState>(
    savedState?.sorting ?? defaultSorting
  );

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    savedState?.columnVisibility ?? defaultVisibility
  );

  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(
    savedState?.columnOrder ?? defaultOrder
  );

  const [compact, setCompact] = useState<boolean>(
    savedState?.compact ?? defaultCompact
  );

  // Persist state changes to VS Code. Merge into the existing blob — the webview
  // state is a single object shared with other consumers (e.g. the Tree sort),
  // so overwriting it wholesale would clobber their slices.
  useEffect(() => {
    const prev = (vscode.getState() as Record<string, unknown>) ?? {};
    vscode.setState({ ...prev, sorting, columnVisibility, columnOrder, compact });
  }, [sorting, columnVisibility, columnOrder, compact]);

  const resetVisibility = () => {
    setColumnVisibility(defaultVisibility);
  };

  const resetSorting = () => {
    setSorting(defaultSorting);
  };

  return {
    sorting,
    setSorting,
    columnVisibility,
    setColumnVisibility,
    columnOrder,
    setColumnOrder,
    compact,
    setCompact,
    resetVisibility,
    resetSorting,
  };
}
