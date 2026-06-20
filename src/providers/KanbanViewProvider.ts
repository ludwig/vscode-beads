/**
 * KanbanViewProvider - backs a standalone Kanban board opened as an editor tab
 * (via BeadPanelManager). Reuses the panel provider's bead loading + message
 * handling and only overrides the routing key so the webview renders the Kanban
 * board directly rather than the PanelShell (vs-xqu.1).
 */

import { BeadsPanelViewProvider } from "./BeadsPanelViewProvider";

export class KanbanViewProvider extends BeadsPanelViewProvider {
  protected readonly viewType = "beadsKanban";
}
