import { EventEmitter } from "events";
import type { Window } from "../Window";
import {
  StagehandAgentManager,
  type StagehandAgentState,
} from "./StagehandAgentManager";

export type AgentEvent =
  | "start"
  | "complete"
  | "error"
  | "cancelled"
  | "screenshot"
  | "history";

export class AgentService extends EventEmitter {
  private static instance: AgentService | null = null;

  private window: Window | null = null;
  private manager: StagehandAgentManager | null = null;

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
    this.manager = null;
  }

  async startAgent(
    goal: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.window) {
      return { success: false, error: "Main window is not ready" };
    }

    const manager = this.ensureManager();
    const state = manager.getState();
    if (state.isRunning) {
      return { success: false, error: "Agent already running" };
    }

    manager
      .runTask(goal)
      .catch((error: unknown) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[AgentService] Agent task error: ${errorMessage}`,
          error
        );
        this.emitLifecycleEvent("error", { error: errorMessage });
      })
      .finally(() => {
        this.window?.setAgentInteractionLocked(false);
      });

    this.window.setAgentInteractionLocked(true);
    return { success: true };
  }

  async cancelAgent(): Promise<void> {
    if (!this.manager) return;
    await this.manager.cancelCurrentTask();
  }

  pauseAgent(): void {
    console.info(
      "[AgentService] pauseAgent called, but StagehandAgentManager does not support pausing."
    );
  }

  async resumeAgent(): Promise<void> {
    console.info(
      "[AgentService] resumeAgent called, but StagehandAgentManager does not support resuming."
    );
  }

  async interruptAgentExecution(): Promise<void> {
    await this.manager?.cancelCurrentTask();
  }

  getAgentState(): StagehandAgentState | null {
    if (!this.manager) return null;
    return this.manager.getState();
  }

  private ensureManager(): StagehandAgentManager {
    if (!this.window) {
      throw new Error("Main window is not ready");
    }

    if (!this.manager) {
      const sidebarContents = this.window.sidebar.view.webContents;
      this.manager = new StagehandAgentManager(sidebarContents, this.window);
      this.attachManagerEvents(this.manager);
    }

    return this.manager;
  }

  private attachManagerEvents(manager: StagehandAgentManager): void {
    manager.on("start", (data) => this.emitLifecycleEvent("start", data));
    manager.on("complete", (data) => {
      this.emitLifecycleEvent("complete", data);
      this.window?.setAgentInteractionLocked(false);
    });
    manager.on("error", (data) => {
      this.emitLifecycleEvent("error", data);
      this.window?.setAgentInteractionLocked(false);
    });
    manager.on("cancelled", (data) => {
      this.emitLifecycleEvent("cancelled", data);
      this.window?.setAgentInteractionLocked(false);
    });
    manager.on("screenshot", (data) =>
      this.emitLifecycleEvent("screenshot", data)
    );
    manager.on("history", (data) => this.emitLifecycleEvent("history", data));
  }

  private emitLifecycleEvent(type: AgentEvent, data: any): void {
    const directEvent = type === "error" ? "agent-error" : type;
    this.emit(directEvent, data);
    this.emit("agent-event", { type, data });
    this.forwardAgentUpdate(type, data);
  }

  private forwardAgentUpdate(type: AgentEvent, data: any): void {
    const sidebarContents = this.window?.sidebar.view.webContents;
    if (!sidebarContents) return;
    sidebarContents.send("agent-update", { type, data });
  }
}
