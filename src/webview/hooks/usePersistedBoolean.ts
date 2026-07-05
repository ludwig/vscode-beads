/**
 * usePersistedBoolean — a boolean useState that persists to the webview's
 * `vscode.getState()`/`setState()` bag under `key`, merging with any other
 * persisted UI state (mirrors useColumnState/useLocalFilter).
 *
 * Survives component unmount/remount (e.g. the one-webview sidebar swapping the
 * Project screen out for the Details takeover) AND webview disposal while
 * hidden — so things like card collapse state stick.
 */

import { useCallback, useState } from "react";
import { vscode } from "../types";

type SetBool = (next: boolean | ((prev: boolean) => boolean)) => void;

export function usePersistedBoolean(key: string, initial: boolean): [boolean, SetBool] {
  const [value, setValue] = useState<boolean>(() => {
    const saved = (vscode.getState() as Record<string, unknown> | undefined)?.[key];
    return typeof saved === "boolean" ? saved : initial;
  });

  const set = useCallback<SetBool>(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: boolean) => boolean)(prev) : next;
        const state = (vscode.getState() as Record<string, unknown> | undefined) ?? {};
        vscode.setState({ ...state, [key]: resolved });
        return resolved;
      });
    },
    [key]
  );

  return [value, set];
}
