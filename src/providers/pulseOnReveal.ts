/**
 * Pulse-on-reveal dispatch (vs-1vxq).
 *
 * When a view is revealed and we want a confirmation ring, the right call
 * depends on whether the webview is already live:
 *  - visible  → pulse now; no fresh "ready" will fire to carry the intent.
 *  - hidden   → arm pulseWhenReady; revealing reconstructs the webview, whose
 *               "ready" handler then fires the ring once mounted.
 *
 * Kept vscode-free so it can be unit-tested in isolation; the provider injects
 * its own `pulse`/`pulseWhenReady` and current visibility.
 */
export interface RevealPulseTarget {
  readonly visible: boolean;
  pulse(): void;
  pulseWhenReady(): void;
}

export function pulseOnReveal(target: RevealPulseTarget): void {
  if (target.visible) {
    target.pulse();
  } else {
    target.pulseWhenReady();
  }
}
