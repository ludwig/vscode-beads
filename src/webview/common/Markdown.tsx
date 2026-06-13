/**
 * Markdown Component
 *
 * Renders markdown content as HTML using `marked`, then sanitizes the output
 * with DOMPurify before injecting it. The webview CSP already blocks script
 * execution (`script-src 'nonce-…'`, no `unsafe-inline`); sanitization is
 * defense-in-depth and strips anything that slips past that guard.
 *
 * Link clicks are intercepted and routed through the extension: workspace
 * file paths open in the editor (`openFile`), safe http(s)/mailto URLs open in
 * the system handler (`openExternal`), and everything else is ignored.
 */

import React, { useMemo, useCallback } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { vscode } from "../types";
import { classifyHref } from "./markdownLinks";

interface MarkdownProps {
  content: string;
  className?: string;
}

// Configure marked for safe rendering
marked.setOptions({
  breaks: false, // Standard markdown: only double newlines create paragraphs
  gfm: true, // GitHub flavored markdown
});

export function Markdown({ content, className }: MarkdownProps): React.ReactElement {
  const html = useMemo(() => {
    if (!content) return "";
    try {
      let result = marked.parse(content) as string;
      // Remove empty paragraphs and excessive whitespace
      result = result.replace(/<p>\s*<\/p>/g, "");
      result = result.replace(/(<br\s*\/?>\s*){2,}/g, "<br>");
      // Sanitize before it ever reaches dangerouslySetInnerHTML.
      return DOMPurify.sanitize(result);
    } catch {
      return "";
    }
  }, [content]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;

    const target = classifyHref(anchor.getAttribute("href"));
    // We own navigation for every anchor: a webview has nowhere to navigate to,
    // so the default action is never useful.
    e.preventDefault();
    e.stopPropagation();

    if (target.kind === "external") {
      vscode.postMessage({ type: "openExternal", url: target.url });
    } else if (target.kind === "file") {
      vscode.postMessage({ type: "openFile", filePath: target.path, line: target.line });
    }
    // kind === "unsafe": ignore.
  }, []);

  return (
    <div
      className={`markdown-content ${className || ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  );
}
