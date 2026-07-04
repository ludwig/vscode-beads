/* eslint-disable @typescript-eslint/no-explicit-any -- minimal structural fakes stand in for vscode panel/view */
import { hostFromPanel, hostFromView } from "../WebviewHost";

// The host factories only read/write plain properties and attach listeners, so
// minimal fakes (cast through `any`) exercise them without the vscode runtime.
function fakePanel(): any {
  return {
    webview: {},
    visible: true,
    title: "vs-initial",
    reveal() {},
    dispose() {},
    onDidChangeViewState() {
      return { dispose() {} };
    },
    onDidDispose() {
      return { dispose() {} };
    },
  };
}

function fakeView(): any {
  return {
    webview: {},
    visible: true,
    title: "fixed",
    show() {},
    onDidChangeVisibility() {
      return { dispose() {} };
    },
    onDidDispose() {
      return { dispose() {} };
    },
  };
}

describe("WebviewHost.setTitle (vs-q0e2)", () => {
  it("retitles an editor-tab panel so it tracks the shown bead", () => {
    const panel = fakePanel();
    const host = hostFromPanel(panel);
    expect(host.isEditorTab).toBe(true);

    host.setTitle("vs-other");
    expect(panel.title).toBe("vs-other");
  });

  it("retitles a sidebar view so its header tracks the screen/bead (vs-filterbar)", () => {
    const view = fakeView();
    const host = hostFromView(view);
    expect(host.isEditorTab).toBe(false);

    // The merged sidebar view drives its title from the current screen (bead id
    // on Details, "Repository" on the Project screen), so setTitle must apply.
    host.setTitle("vs-other");
    expect(view.title).toBe("vs-other");
  });
});
