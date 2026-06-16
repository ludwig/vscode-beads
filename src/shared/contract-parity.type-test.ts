/**
 * Compile-time parity guard for the shared webview↔extension contract.
 *
 * This file is intentionally NOT a Jest test — it asserts, at `tsc` time, that
 * the extension side (`backend/types.ts`) and the webview side
 * (`webview/types.ts`) still resolve their protocol/data types to the single
 * shared definition. If anyone reintroduces a hand-maintained local copy on
 * either side (the exact drift this module was created to kill), the `Equal`
 * assertions below stop compiling and `bun run tsc --noEmit` fails.
 *
 * No runtime footprint: nothing imports this, so it is never bundled.
 */

import type {
  Bead as ExtBead,
  BeadsProject as ExtProject,
  ExtensionToWebviewMessage as ExtToWebview,
  WebviewToExtensionMessage as ExtFromWebview,
} from "../backend/types";

import type {
  Bead as WebBead,
  BeadsProject as WebProject,
  ExtensionMessage as WebExtensionMessage,
  WebviewMessage as WebWebviewMessage,
} from "../webview/types";

// Exact type-equality check (invariant in both directions).
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;

// If any of these break, the two sides have drifted — re-point the offending
// module at src/shared/contract.ts instead of redefining the type.
export type _BeadParity = Expect<Equal<ExtBead, WebBead>>;
export type _ProjectParity = Expect<Equal<ExtProject, WebProject>>;
export type _ExtToWebviewParity = Expect<Equal<ExtToWebview, WebExtensionMessage>>;
export type _ExtFromWebviewParity = Expect<Equal<ExtFromWebview, WebWebviewMessage>>;
