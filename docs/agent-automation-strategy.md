# Agent Automation Strategy for VS Code Extension Development

## Current Stack

```
Chrome DevTools MCP + openvscode-server (Docker, headed) + embedded bd
```

Agent can see and interact with VS Code running in browser. Human watches same window.
See `docs/openvscode-docker-testing.md` for the harness, driven by the `vscode-server` skill.

> **Why this works now (and didn't before):** OpenVSCode Server in Docker was
> previously ruled out because the in-container `bd` couldn't connect to a Dolt
> **sql-server** over its socket. That failure is server-mode-specific. With
> **embedded Dolt** (in-process engine, `gms_pure_go`, no server/socket — the
> default in the Gas Town fork), there's nothing to connect to, so the blocker
> doesn't apply. The container `bd` is cross-compiled with that tag.

## Workflow

1. Agent writes/edits code
2. Host watch mode rebuilds `dist/` (mounted read-only into the container)
3. **Human reloads browser** (or `/vscode-server:reload`)
4. Limited DevTools MCP use for single-feature verification

No per-change VSIX packaging/install: the repo is mounted, so a rebuild + browser
reload is enough.

## Context Cost Problem

Both Chrome DevTools MCP and Playwright MCP return full accessibility tree (~400 lines) after every action. This burns context fast.

**Current mitigations:**
- Human handles reloads
- Minimal MCP interactions
- Compact sessions frequently

**Future:** Build custom optimized tooling (see vsbeads-n64)

## Capabilities

| Capability | How |
|------------|-----|
| Extension install | repo bind-mounted into container (no install step) |
| Window reload | Command palette (human) |
| Screenshots | `take_screenshot` |
| Console logs | `list_console_messages` |
| UI interaction | `click`, `fill`, `press_key` |
| Command palette | `press_key` Meta+Shift+P |

---

## Ruled Out Options

| Option | Why Ruled Out |
|--------|---------------|
| **vscode.dev** | No local extension support |
| **OpenVSCode Server (Docker) — server-mode bd** | Unix socket blocked in container, bd CLI can't reach the Dolt sql-server. **Revisited:** now the current stack using *embedded* bd (no server/socket). See above. |
| **code-server** | Pins to an older Node than upstream VS Code; lags current LTS |
| **Playwright MCP** | Same context bloat as Chrome DevTools MCP |
| **Browser MCP** | Less capable than Chrome DevTools MCP |
| **@vscode/test-electron** | Tests API only, not visual UI |
| **F5 Dev Host** | Agent can't see/interact |
| **Headless + VNC** | Unnecessary complexity for local dev |

## References

- [code-server](https://github.com/coder/code-server)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Context optimization discussion](https://scottspence.com/posts/optimising-mcp-server-context-usage-in-claude-code)
