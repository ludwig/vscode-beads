import * as crypto from "crypto";
import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import * as vscode from "vscode";
import { Logger } from "../utils/logger";
import { resolveEnvVariables } from "../utils/resolve-env-variables";
import { BeadsBackend } from "./BeadsBackend";
import { BeadsDoltBackend } from "./BeadsDoltBackend";
import { BeadsCommandRunner } from "./BeadsCommandRunner";
import { CONFIG_NAMESPACE, DEFAULT_PROJECTS_ROOT } from "../constants";
import { backendKindForMode, createDoltModeProbe, detectDoltMode } from "./doltMode";
import { parseConfiguredPrefix } from "./projectPrefix";
import { Bead, BeadsProject } from "./types";

const ACTIVE_PROJECT_KEY = "beads.activeProjectId";
const execFileAsync = util.promisify(execFile);

type BackendStatusState = "running" | "stopped" | "zombie" | "not_initialized" | "unknown";

export class BeadsProjectManager implements vscode.Disposable {
  private readonly context: vscode.ExtensionContext;
  private readonly log: Logger;
  private projects: BeadsProject[] = [];
  private activeProject: BeadsProject | null = null;
  private backend: BeadsBackend | null = null;

  private activePollTimer: NodeJS.Timeout | null = null;
  private activePollToken: string | null = null;

  private readonly _onProjectsChanged = new vscode.EventEmitter<BeadsProject[]>();
  public readonly onProjectsChanged = this._onProjectsChanged.event;

  private readonly _onActiveProjectChanged = new vscode.EventEmitter<BeadsProject | null>();
  public readonly onActiveProjectChanged = this._onActiveProjectChanged.event;

  private readonly _onDataChanged = new vscode.EventEmitter<void>();
  public readonly onDataChanged = this._onDataChanged.event;

  // Fires whenever the bead-list cache is (re)populated, so consumers that
  // resolve ids against it — e.g. the favorites section's id→title lookup
  // (vs-sd5.1) — can re-resolve once a project's list lands. The cache is
  // cleared on project switch and refilled asynchronously by the panel load,
  // so this is the signal that titles are now available.
  private readonly _onBeadsCached = new vscode.EventEmitter<void>();
  public readonly onBeadsCached = this._onBeadsCached.event;

  /**
   * Most recently loaded list of beads, keyed by id. Lets the Details view
   * paint known fields (title/status/priority/description/labels/type/assignee)
   * the instant a bead is selected, before the cold `bd show` spawn returns
   * (vs-7s7). Populated by the panel/dashboard after each list(); cleared on
   * project switch so a stale project's beads are never surfaced.
   */
  private cachedBeads = new Map<string, Bead>();

  /** Active issue prefix (e.g. "vs"), derived from the loaded issue IDs. */
  private activePrefix: string | null = null;
  private readonly _onPrefixChanged = new vscode.EventEmitter<string | null>();
  public readonly onPrefixChanged = this._onPrefixChanged.event;

  constructor(context: vscode.ExtensionContext, logger: Logger) {
    this.context = context;
    this.log = logger.child("ProjectManager");
  }

  async initialize(): Promise<void> {
    await this.discoverProjects();

    if (this.projects.length > 0 && !this.activeProject) {
      const savedProjectId = this.context.workspaceState.get<string>(ACTIVE_PROJECT_KEY);
      const targetProject = savedProjectId
        ? this.projects.find((p) => p.id === savedProjectId)
        : undefined;
      await this.setActiveProject(targetProject?.id ?? this.projects[0].id);
    }
  }

  async discoverProjects(): Promise<void> {
    const discoveredById = new Map<string, BeadsProject>();

    const configuredProjects = await Promise.all(
      this.getConfiguredProjectPaths().map((explicitPath) => this.createProjectFromInputPath(explicitPath, "setting"))
    );
    for (const project of configuredProjects) {
      if (project && !discoveredById.has(project.id)) discoveredById.set(project.id, project);
    }

    const envBeadsDir = process.env.BEADS_DIR?.trim();
    if (envBeadsDir) {
      const project = await this.createProjectFromInputPath(envBeadsDir, "env");
      if (project && !discoveredById.has(project.id)) discoveredById.set(project.id, project);
    }

    const workspaceProjects = await Promise.all(
      (vscode.workspace.workspaceFolders ?? []).map((folder) => this.createProjectFromInputPath(folder.uri.fsPath, "workspace"))
    );
    for (const project of workspaceProjects) {
      if (project && !discoveredById.has(project.id)) discoveredById.set(project.id, project);
    }

    // Additive: fold in every project under the default beads root that isn't
    // already discovered above. Configured/env/workspace sources win on dedup
    // so their richer `source` label is preserved.
    for (const project of await this.discoverProjectsUnderRoot(DEFAULT_PROJECTS_ROOT)) {
      if (!discoveredById.has(project.id)) discoveredById.set(project.id, project);
    }

    const discoveredProjects = Array.from(discoveredById.values()).sort((a, b) => a.name.localeCompare(b.name));
    this.projects = discoveredProjects;
    this._onProjectsChanged.fire(this.projects);
  }

  getProjects(): BeadsProject[] {
    return this.projects;
  }

  getActiveProject(): BeadsProject | null {
    return this.activeProject;
  }

  /** The active issue prefix (e.g. "vs"), or null if not yet derived. */
  getActivePrefix(): string | null {
    return this.activePrefix;
  }

  /**
   * Records the most recently loaded list so selections can paint instantly
   * from cached row data (vs-7s7). Replaces the previous snapshot wholesale so
   * beads removed from the list don't linger.
   */
  cacheBeadList(beads: Bead[]): void {
    this.cachedBeads = new Map(beads.map((bead) => [bead.id, bead]));
    this._onBeadsCached.fire();
  }

  /**
   * Returns the cached list row for a bead, or null if the list hasn't been
   * loaded yet (cold cache → caller falls back to the loading state).
   */
  getCachedBead(id: string): Bead | null {
    return this.cachedBeads.get(id) ?? null;
  }

  /** All cached list rows (empty if the list hasn't been loaded yet). */
  getCachedBeadList(): Bead[] {
    return [...this.cachedBeads.values()];
  }

  /**
   * Records the active issue prefix derived from the currently loaded issue
   * IDs. Fires onPrefixChanged only when the value actually changes so the
   * status bar refreshes without churn.
   */
  setActivePrefix(prefix: string | null): void {
    if (prefix === this.activePrefix) {
      return;
    }
    this.activePrefix = prefix;
    this._onPrefixChanged.fire(prefix);
  }

  getBackend(): BeadsBackend | null {
    return this.backend;
  }

  getClient(): BeadsBackend | null {
    return this.backend;
  }

  async setActiveProject(projectId: string): Promise<boolean> {
    let project = this.projects.find((p) => p.id === projectId);
    if (!project) {
      this.log.warn(`Project ${projectId} not found in current cache; rediscovering.`);
      await this.discoverProjects();
      project = this.projects.find((p) => p.id === projectId);
    }

    if (!project) {
      this.log.warn(`Project ${projectId} still not found after rediscovery.`);
      return false;
    }

    this.log.info(`Switching active project to ${project.name} (${project.id})`);

    await this.activateProject(project, { emitActiveProjectChanged: true, persistSelection: true, emitDataChanged: false });
    return true;
  }

  /**
   * Broadcasts a data-changed event so all views re-fetch. Call after a
   * successful write (update/create/dependency/comment) so sibling views
   * (panel, dashboard, details) refresh without a manual Refresh — the
   * write path is otherwise silent (vs-mxq).
   */
  notifyDataChanged(): void {
    this._onDataChanged.fire();
  }

  async refresh(): Promise<void> {
    await this.discoverProjects();

    const activeId = this.activeProject?.id;
    if (!activeId) {
      if (this.projects.length > 0) {
        await this.setActiveProject(this.projects[0].id);
      }
      this._onDataChanged.fire();
      return;
    }

    const stillExists = this.projects.some((p) => p.id === activeId);
    if (!stillExists) {
      this.activeProject = null;
      this.backend = null;
      this._onActiveProjectChanged.fire(null);
      this._onDataChanged.fire();
      return;
    }

    const activeProject = this.projects.find((project) => project.id === activeId);
    if (activeProject) {
      await this.activateProject(activeProject, {
        emitActiveProjectChanged: false,
        persistSelection: false,
        emitDataChanged: true,
      });
    }
  }

  async getBackendStatus(): Promise<{ state: BackendStatusState; message: string; details?: Record<string, unknown> }> {
    if (!this.activeProject || !this.backend) {
      return { state: "unknown", message: "No active project" };
    }

    const compatibility = await this.backend.checkCompatibility();
    if (!compatibility.supported) {
      return {
        state: "stopped",
        message: compatibility.message,
        details: {
          detectedVersion: compatibility.detectedVersion,
          minimumVersion: compatibility.minimumVersion,
        },
      };
    }

    try {
      await this.backend.probeLive();
    } catch (error) {
      if (this.isNotInitializedError(error)) {
        return {
          state: "not_initialized",
          message: "Beads project is not initialized. Run `bd init` in this project. See Output > Beads for details.",
        };
      }

      const message = error instanceof Error ? error.message : String(error);
      return {
        state: "zombie",
        message,
        details: {
          beadsDir: this.activeProject.beadsDir,
          detectedVersion: compatibility.detectedVersion,
          minimumVersion: compatibility.minimumVersion,
        },
      };
    }

      return {
        state: "running",
        message: compatibility.message,
        details: {
          beadsDir: this.activeProject.beadsDir,
        },
      };
  }

  async showProjectPicker(): Promise<BeadsProject | undefined> {
    if (this.projects.length === 0) {
      const CREATE = "Create Board";
      void vscode.window
        .showWarningMessage("No Beads boards found.", CREATE)
        .then((choice) => {
          if (choice === CREATE) vscode.commands.executeCommand("beads.initRepository");
        });
      return undefined;
    }

    const items = this.projects.map((project) => ({
      label: project.name,
      description: project.rootPath,
      project,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a Beads project",
      title: "Switch Beads Project",
    });

    if (!selected) return undefined;
    await this.setActiveProject(selected.project.id);
    return selected.project;
  }

  async notifyBackendError(err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    this.log.trace(`Backend error: ${message}`);
  }

  dispose(): void {
    if (this.activePollTimer) {
      clearInterval(this.activePollTimer);
      this.activePollTimer = null;
    }
    this._onProjectsChanged.dispose();
    this._onActiveProjectChanged.dispose();
    this._onDataChanged.dispose();
    this._onBeadsCached.dispose();
    this._onPrefixChanged.dispose();
  }

  private getConfiguredProjectPaths(): string[] {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const configured = config.get<string[]>("projects", []);
    return configured.filter((value) => typeof value === "string" && value.trim().length > 0);
  }

  private async createProjectFromInputPath(inputPath: string, source: BeadsProject["source"]): Promise<BeadsProject | null> {
    const resolvedInput = path.resolve(inputPath);
    // Auto-discovered children under ~/beads are pre-validated and absences are
    // expected, so stay silent for `default`. Explicitly-configured paths
    // (settings / $BEADS_DIR / workspace folder) are user intent — if they
    // don't resolve, say so instead of vanishing silently.
    const isExplicit = source !== "default";
    const stats = await this.tryStat(resolvedInput);
    if (!stats) {
      if (isExplicit) {
        this.log.warn(
          `Skipping ${source} project: path does not exist or is unreadable: ${resolvedInput} (from "${inputPath}")`
        );
      }
      return null;
    }

    const rootPath = path.basename(resolvedInput) === ".beads" ? path.dirname(resolvedInput) : resolvedInput;
    const explicitBeadsDir = path.basename(resolvedInput) === ".beads" ? resolvedInput : undefined;
    const projectProbe = await this.probeBeadsProject(rootPath, explicitBeadsDir);
    if (!projectProbe) {
      if (isExplicit) {
        this.log.warn(
          `Skipping ${source} project: no Beads project found at ${rootPath} (run 'bd init' there, or fix the configured path)`
        );
      }
      return null;
    }

    const folderName = this.getProjectDisplayName(rootPath, projectProbe.beadsDir);
    const prefix = await this.resolveProjectPrefix(projectProbe.beadsDir, rootPath);

    return {
      id: this.generateProjectId(projectProbe.beadsDir),
      name: folderName,
      rootPath,
      displayPath: this.toDisplayPath(rootPath),
      beadsDir: projectProbe.beadsDir,
      backendStatus: "running",
      source,
      prefix,
    };
  }

  /** Home-abbreviated absolute path (e.g. `~/beads/vs`) for compact display. */
  private toDisplayPath(absolutePath: string): string {
    const home = os.homedir();
    if (absolutePath === home) return "~";
    if (absolutePath.startsWith(home + path.sep)) return "~" + absolutePath.slice(home.length);
    return absolutePath;
  }

  /**
   * Discover every immediate child of `root` that contains a `.beads`
   * directory, as a `default`-source project. Returns [] when the root is
   * missing/unreadable so a non-existent ~/beads is simply a no-op.
   */
  private async discoverProjectsUnderRoot(root: string): Promise<BeadsProject[]> {
    const resolvedRoot = path.resolve(root);

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(resolvedRoot, { withFileTypes: true });
    } catch {
      return [];
    }

    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map(async (entry) => {
          const childPath = path.join(resolvedRoot, entry.name);
          const beadsStats = await this.tryStat(path.join(childPath, ".beads"));
          if (!beadsStats?.isDirectory()) return null;
          return this.createProjectFromInputPath(childPath, "default");
        })
    );

    return candidates.filter((project): project is BeadsProject => project !== null);
  }

  /**
   * Resolve a project's effective issue prefix: the explicit `issue-prefix`
   * from `.beads/config.yaml` when set, otherwise the directory name (bd
   * auto-detects the prefix from the dir name when it isn't configured). Pure
   * file read — no `bd` spawn — to keep discovery cheap.
   */
  private async resolveProjectPrefix(beadsDir: string, rootPath: string): Promise<string> {
    let contents: string | null = null;
    try {
      contents = await fs.promises.readFile(path.join(beadsDir, "config.yaml"), "utf8");
    } catch {
      contents = null;
    }

    return parseConfiguredPrefix(contents) ?? path.basename(rootPath);
  }

  private async probeBeadsProject(
    rootPath: string,
    explicitBeadsDir?: string
  ): Promise<{ beadsDir: string } | null> {
    const bdPath = this.getBdPath();
    const commandLabel = `${bdPath} where`;

    try {
      const env = {
        ...process.env,
        ...(explicitBeadsDir ? { BEADS_DIR: explicitBeadsDir } : {}),
      };

      this.log.debug(
        `Running discovery probe: ${commandLabel} (cwd=${rootPath}${explicitBeadsDir ? `, BEADS_DIR=${explicitBeadsDir}` : ""})`
      );
      const startedAt = Date.now();

      const { stdout } = await execFileAsync(bdPath, ["where"], {
        cwd: rootPath,
        env,
        maxBuffer: 1024 * 1024,
      });
      const elapsedMs = Date.now() - startedAt;
      this.log.debug(`Completed discovery probe: ${commandLabel} (${elapsedMs}ms)`);
      const trimmedStdout = stdout.trim();
      if (trimmedStdout) this.log.trace(`discovery stdout: ${trimmedStdout}`);

      const beadsDirLine = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      if (!beadsDirLine) return null;

      const beadsDir = path.resolve(rootPath, beadsDirLine);
      return {
        beadsDir,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.trace(`Discovery probe failed for ${rootPath}: ${message}`);
      return null;
    }
  }

  private getProjectDisplayName(rootPath: string, beadsDir: string): string {
    const workspaceName = path.basename(rootPath) || rootPath;
    const canonicalRepoName = path.basename(path.dirname(beadsDir));

    if (!canonicalRepoName || canonicalRepoName === workspaceName) {
      return workspaceName;
    }

    return `${canonicalRepoName} (${workspaceName})`;
  }

  private generateProjectId(beadsDir: string): string {
    return crypto.createHash("sha256").update(beadsDir).digest("hex").slice(0, 12);
  }

  private syncActiveProjectPolling(): void {
    if (this.activePollTimer) {
      clearInterval(this.activePollTimer);
      this.activePollTimer = null;
    }
    this.activePollToken = null;

    const project = this.activeProject;
    const backend = this.backend;
    if (!project || !backend) return;

    const intervalMs = Math.max(
      0,
      vscode.workspace.getConfiguration(CONFIG_NAMESPACE).get<number>("refreshInterval", 0)
    );
    if (intervalMs === 0) return;

    this.log.debug(`Watching Dolt changes for ${project.name} every ${intervalMs}ms`);

    const poll = async () => {
      if (this.activeProject?.id !== project.id || this.backend !== backend) return;
      try {
        this.log.trace(`Polling Dolt change token for ${project.name}`);
        const token = await backend.getChangeToken();
        if (!token) return;
        if (this.activePollToken === null) {
          this.activePollToken = token;
          this.log.debug(`Initialized Dolt change token for ${project.name}`);
          return;
        }
        if (token !== this.activePollToken) {
          this.activePollToken = token;
          this.log.debug(`Detected Dolt change for ${project.name}`);
          this._onDataChanged.fire();
        }
      } catch (error) {
        this.log.trace(`Active project poll failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    void poll();
    this.activePollTimer = setInterval(() => {
      void poll();
    }, intervalMs);
  }

  private async runBdDoltShow(bdPath: string, cwd: string): Promise<string> {
    const { stdout } = await execFileAsync(bdPath, ["dolt", "show"], { cwd });
    return stdout;
  }

  private async tryStat(target: string): Promise<fs.Stats | null> {
    try {
      return await fs.promises.stat(target);
    } catch {
      return null;
    }
  }

  private async activateProject(
    project: BeadsProject,
    options: { emitActiveProjectChanged: boolean; persistSelection: boolean; emitDataChanged: boolean }
  ): Promise<void> {
    const oldBackend = this.backend;
    if (oldBackend) {
      await oldBackend.dispose();
    }

    this.activeProject = project;

    // Drop the previous project's list snapshot so a selection in the new
    // project never paints a stale bead from the old one (vs-7s7).
    this.cachedBeads.clear();

    if (options.persistSelection) {
      await this.context.workspaceState.update(ACTIVE_PROJECT_KEY, project.id);
    }

    const bdPath = this.getBdPath();

    const probe = createDoltModeProbe({
      beadsDir: project.beadsDir,
      doltShow: () => this.runBdDoltShow(bdPath, project.rootPath),
    });
    const mode = await detectDoltMode(probe);
    project.doltMode = mode;
    this.log.info(`Project ${project.name} uses ${mode} Dolt mode`);

    const backendParams = {
      bdPath,
      cwd: project.rootPath,
      beadsDir: project.beadsDir,
      log: this.log,
      minSupportedVersion: "0.51.0",
    };
    this.backend =
      backendKindForMode(mode) === "sql"
        ? new BeadsDoltBackend(backendParams)
        : new BeadsCommandRunner(backendParams);

    project.backendStatus = "unknown";
    this.activePollToken = null;

    if (options.emitActiveProjectChanged) {
      // Clear the prefix so the status bar doesn't show the previous project's
      // prefix until the new project's issues load and re-derive it.
      this.setActivePrefix(null);
      this._onActiveProjectChanged.fire(project);
    }

    this.syncActiveProjectPolling();

    if (options.emitDataChanged) {
      this._onDataChanged.fire();
    }

    const compatibility = await this.backend.checkCompatibility();
    project.backendStatus = compatibility.supported ? "running" : "stopped";
    project.bdVersion = compatibility.detectedVersion;
    if (compatibility.supported) {
      try {
        this.activePollToken = await this.backend.getChangeToken();
      } catch (error) {
        this.log.trace(`Failed to initialize change token: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private resolveBdPath(configuredPath: string): string {
    const raw = configuredPath || "bd";
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const resolvedPath = workspaceRoot && !path.isAbsolute(raw) ? path.resolve(workspaceRoot, raw) : raw;

    if (resolvedPath !== raw && fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }

    if (path.isAbsolute(raw) || raw === "bd") {
      return raw;
    }

    return fs.existsSync(raw) ? raw : "bd";
  }

  /**
   * The resolved `bd` executable path (config + ${env:VAR} + workspace-relative
   * resolution). Public so the init flow can preflight/run `bd` against the same
   * binary the backend uses (vs-r6a1).
   */
  getBdPath(): string {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const configuredBdPath = config.get<string>("pathToBd", "bd") ?? "bd";
    return this.resolveBdPath(resolveEnvVariables(configuredBdPath).trim());
  }

  /**
   * The root directory under which new boards are created and auto-discovered.
   * Currently the hardcoded default; vs-r6a1.6/vs-2re will swap in the
   * `beads.projectsRoot` setting here without touching callers.
   */
  getProjectsRoot(): string {
    return DEFAULT_PROJECTS_ROOT;
  }

  /**
   * Re-discover projects and activate the one rooted at `rootPath` (e.g. a board
   * just created by the init command). Returns false if discovery didn't pick it
   * up. Project ids are a hash of the .beads dir, so we match on the resolved
   * root path rather than recomputing the id here (vs-r6a1.4).
   */
  async discoverAndActivateProjectAt(rootPath: string): Promise<boolean> {
    await this.discoverProjects();
    const target = path.resolve(rootPath);
    const project = this.projects.find((p) => path.resolve(p.rootPath) === target);
    if (!project) {
      this.log.warn(`Newly created project at ${rootPath} not found after discovery`);
      return false;
    }
    return this.setActiveProject(project.id);
  }

  private isNotInitializedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    const missingNamedDatabase = normalized.includes('database "') && normalized.includes('" not found');
    return normalized.includes("not initialized") || missingNamedDatabase;
  }
}
