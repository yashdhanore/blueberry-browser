import { Stagehand } from "@browserbasehq/stagehand";
import { EventEmitter } from "events";
import type { Window } from "../Window";
import { AgentOrchestrator } from "./AgentOrchestrator";

type AgentEvent =
  | "start"
  | "turn"
  | "action"
  | "actionComplete"
  | "reasoning"
  | "screenshot"
  | "complete"
  | "error"
  | "cancelled"
  | "paused"
  | "resumed";

/**
 */
export class AgentService extends EventEmitter {
  private static instance: AgentService | null = null;

  private stagehand: Stagehand | null = null;
  private initPromise: Promise<Stagehand> | null = null;
  private orchestrator: AgentOrchestrator | null = null;
  private window: Window | null = null;

  private constructor() {
    super();
  }

  static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  setWindow(window: Window): void {
    this.window = window;
  }

  /**
   * Kick off a new agent run. Returns synchronously with success/failure
   * indicating whether a run was accepted.
   */
  async startAgent(
    goal: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.window) {
      return { success: false, error: "Main window is not ready" };
    }

    if (this.orchestrator && this.orchestrator.getContext().isRunning()) {
      return { success: false, error: "Agent already running" };
    }

    const orchestrator = new AgentOrchestrator(this.window, this);
    this.orchestrator = orchestrator;
    this.setupOrchestratorListeners(orchestrator);

    orchestrator.startTask(goal).catch((error) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[AgentService] Agent task error: ${errorMessage}`, error);
      const payload = {
        error: errorMessage,
      };
      this.emit("agent-error", payload);
      this.emit("agent-event", { type: "error", data: payload });
    });

    return { success: true };
  }

  async cancelAgent(): Promise<void> {
    if (!this.orchestrator) return;
    try {
      await this.orchestrator.cancelTask();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[AgentService] Failed to cancel agent: ${errorMessage}`,
        error
      );
    } finally {
      this.orchestrator = null;
    }
  }

  pauseAgent(): void {
    try {
      this.orchestrator?.pauseTask();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[AgentService] Failed to pause agent: ${errorMessage}`,
        error
      );
    }
  }

  async resumeAgent(): Promise<void> {
    try {
      await this.orchestrator?.resumeTask();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[AgentService] Failed to resume agent: ${errorMessage}`,
        error
      );
    }
  }

  async interruptAgentExecution(): Promise<void> {
    if (!this.stagehand) return;
    try {
      console.info(
        "[AgentService] Interrupting Stagehand session due to cancellation..."
      );
      await this.stagehand.close({ force: true });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn(
        `[AgentService] Failed to close Stagehand during cancellation: ${errorMessage}`,
        error
      );
    } finally {
      this.stagehand = null;
      this.initPromise = null;
    }
  }

  getAgentState(): {
    isRunning: boolean;
    isPaused: boolean;
    goal: string | null;
    currentTurn: number;
    maxTurns: number;
    actions: any[];
    error: string | null;
  } | null {
    if (!this.orchestrator) return null;

    const context = this.orchestrator.getContext();
    const ctx = context.getContext();

    return {
      isRunning: context.isRunning(),
      isPaused: context.isPaused(),
      goal: ctx.userGoal,
      currentTurn: context.getCurrentTurn(),
      maxTurns: context.getConfig().maxTurns,
      actions: ctx.actions.map((a) => ({
        id: a.id,
        type: a.functionCall.name,
        args: a.functionCall.args,
        status: a.status,
        timestamp: a.timestamp,
      })),
      error: ctx.error || null,
    };
  }

  /**
   * Agent event wiring & forwarding
   */
  private setupOrchestratorListeners(orchestrator: AgentOrchestrator): void {
    const events: AgentEvent[] = [
      "start",
      "turn",
      "action",
      "actionComplete",
      "reasoning",
      "screenshot",
      "complete",
      "error",
      "cancelled",
      "paused",
      "resumed",
    ];

    events.forEach((event) => {
      orchestrator.on(event, (data: any) => {
        // Toggle interaction lock on the main window while the agent is active
        if (event === "start") {
          this.window?.setAgentInteractionLocked(true);
        }

        this.forwardAgentUpdate(event, data);
        const directEvent = event === "error" ? "agent-error" : event;
        this.emit(directEvent, data);
        this.emit("agent-event", { type: event, data });

        if (
          event === "complete" ||
          event === "error" ||
          event === "cancelled"
        ) {
          // Release interaction lock once the agent is done
          this.window?.setAgentInteractionLocked(false);
          this.orchestrator = null;
        }
      });
    });
  }

  private forwardAgentUpdate(type: AgentEvent, data: any): void {
    const sidebarContents = this.window?.sidebar.view.webContents;
    if (!sidebarContents) return;
    sidebarContents.send("agent-update", { type, data });
  }

  /**
   * Stagehand lifecycle helpers
   */
  async getStagehand(): Promise<Stagehand> {
    if (this.stagehand) {
      return this.stagehand;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.createStagehand();

    try {
      this.stagehand = await this.initPromise;
      return this.stagehand;
    } finally {
      this.initPromise = null;
    }
  }

  getContext(): any | null {
    if (!this.stagehand) return null;
    return (this.stagehand as any).context ?? null;
  }

  async getPageForActiveTab(window: Window): Promise<any> {
    const stagehand = await this.getStagehand();
    const ctx = (stagehand as any).context;
    if (!ctx) {
      throw new Error("Stagehand context not available");
    }

    const pages = ctx.pages() as any[];
    const activeTab = window.activeTab;

    const isAuxiliaryUrl = (url: string | undefined | null) => {
      if (!url) return true;
      const lower = url.toLowerCase();
      if (lower.startsWith("chrome://") || lower.startsWith("devtools://"))
        return true;
      if (lower.includes("localhost:5173/topbar")) return true;
      if (lower.includes("localhost:5173/sidebar")) return true;
      return false;
    };

    if (activeTab) {
      const tabUrl = activeTab.url;
      const matchByUrl = pages.find((p) => {
        try {
          return p.url() === tabUrl;
        } catch {
          return false;
        }
      });
      if (matchByUrl) {
        return matchByUrl;
      }
    }

    const nonAuxPages = pages.filter((p) => {
      try {
        return !isAuxiliaryUrl(p.url());
      } catch {
        return false;
      }
    });

    if (nonAuxPages.length > 0) {
      const active = ctx.activePage?.();
      if (active && nonAuxPages.includes(active)) {
        return active;
      }
      return nonAuxPages[nonAuxPages.length - 1];
    }

    const active = ctx.activePage?.();
    if (active && !isAuxiliaryUrl(active.url())) {
      return active;
    }

    throw new Error("No suitable Stagehand page found for active tab");
  }

  async shutdown(opts?: { force?: boolean }): Promise<void> {
    if (!this.stagehand) return;

    try {
      console.info("[AgentService] Closing Stagehand session...");
      await this.stagehand.close(opts);
      console.info("[AgentService] Stagehand session closed.");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(
        `[AgentService] Error while closing Stagehand session: ${errorMessage}`,
        err
      );
    } finally {
      this.stagehand = null;
    }
  }

  private async createStagehand(): Promise<Stagehand> {
    const cdpUrl = await this.resolveCdpUrl();
    console.info(
      `[AgentService] Initializing Stagehand connected to Electron at ${cdpUrl}...`
    );

    const stagehand = new Stagehand({
      env: "LOCAL",
      experimental: true,
      disableAPI: true,
      localBrowserLaunchOptions: {
        cdpUrl,
      },
      selfHeal: true,
    });

    await stagehand.init();
    console.info("[AgentService] Stagehand initialized successfully.");

    return stagehand;
  }

  private async resolveCdpUrl(): Promise<string> {
    const base =
      process.env.ELECTRON_REMOTE_DEBUGGING_URL || "http://127.0.0.1:9222";
    const versionUrl = `${base.replace(/\/$/, "")}/json/version`;

    try {
      const res = await fetch(versionUrl);
      if (!res.ok) {
        throw new Error(`CDP endpoint returned ${res.status}`);
      }
      const data = (await res.json()) as { webSocketDebuggerUrl?: string };
      if (data?.webSocketDebuggerUrl) {
        return data.webSocketDebuggerUrl;
      }
      return base;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(
        `[AgentService] Failed to resolve CDP ws endpoint from ${versionUrl}, falling back to ${base}: ${errorMessage}`
      );
      return base;
    }
  }
}
