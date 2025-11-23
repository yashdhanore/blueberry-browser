import { EventEmitter } from "events";
import {
  type AgentResult as StagehandAgentResult,
  type AgentAction as StagehandAgentAction,
} from "@browserbasehq/stagehand";
import { Window } from "../Window";
import { ComputerUseActions } from "./ComputerUseActions";
import { ContextManager } from "./ContextManager";
import {
  AgentAction,
  ActionStatus,
  AgentState,
  AgentError,
  AgentErrorCode,
} from "./ComputerUseTypes";
import { StagehandService } from "./StagehandService";

export class AgentOrchestrator extends EventEmitter {
  private window: Window;
  private tools: ComputerUseActions;
  private context: ContextManager;
  private stagehandService: StagehandService;
  private isRunning: boolean = false;

  constructor(window: Window, _geminiApiKey?: string) {
    super();

    this.window = window;
    this.tools = new ComputerUseActions(window);
    this.context = new ContextManager();
    this.stagehandService = StagehandService.getInstance();
    this.setupContextForwarding();
  }

  async startTask(goal: string): Promise<void> {
    if (this.isRunning) {
      throw new Error("Agent is already running a task");
    }

    this.isRunning = true;

    this.context.startTask(goal);
    this.emit("start", { goal });

    try {
      await this.stagehandService.getStagehand();

      const initialTurn = this.context.getCurrentTurn();
      this.emit("turn", { turn: initialTurn });

      const { screenshot, url } = await this.captureState();
      this.context.setCurrentUrl(url);
      this.emit("screenshot", {
        turn: initialTurn,
        screenshot: screenshot.toString("base64"),
      });

      await this.runStagehandAgent();
    } catch (error) {
      console.error("Agent error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.context.failTask(errorMessage);
      this.emit("error", {
        error: errorMessage,
        turn: this.context.getCurrentTurn(),
      });
    } finally {
      this.isRunning = false;
    }
  }

  async cancelTask(): Promise<void> {
    if (!this.isRunning) {
      throw new Error("No task is running");
    }

    this.context.cancelTask();
    this.emit("cancelled", {});
  }

  pauseTask(): void {
    if (!this.isRunning) {
      throw new Error("No task is running");
    }

    this.context.pauseTask();
    this.emit("paused", {});
  }

  async resumeTask(): Promise<void> {
    if (!this.context.isPaused()) {
      throw new Error("No paused task to resume");
    }

    this.context.resumeTask();
    this.emit("resumed", {});
  }

  getContext(): ContextManager {
    return this.context;
  }

  private async runStagehandAgent(): Promise<void> {
    const stagehand = await this.stagehandService.getStagehand();

    let page;
    try {
      page = await this.stagehandService.getPageForActiveTab(this.window);
    } catch (error) {
      console.warn("Failed to resolve Stagehand page, falling back:", error);
      const ctx = (stagehand as any).context;
      page = ctx?.activePage?.();
    }

    if (!page) {
      throw new AgentError(
        "No suitable Stagehand page found for agent execution",
        AgentErrorCode.INVALID_STATE
      );
    }

    const goal = this.context.getGoal();
    const config = this.context.getConfig();

    const agent = stagehand.agent({
      cua: true,
      model: "google/gemini-2.5-computer-use-preview-10-2025",
      systemPrompt: `
You're a helpful assistant that can control a web browser called Blueberry Browser.

- Always work toward the user's stated goal step by step.
- Only interact with the main web content in the active tab.
- Never click or type in the top bar or sidebar UI of the app.
- Avoid destructive or irreversible actions (e.g. deleting data, posting content) unless explicitly asked.
- Prefer clear navigation, reading, searching, and extracting information for the user.
      `.trim(),
    });

    let result: StagehandAgentResult;
    try {
      result = await agent.execute({
        instruction: goal,
        maxSteps: config.maxTurns,
        page,
        highlightCursor: true,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "Unknown");
      throw new AgentError(
        `Stagehand agent execution failed: ${message}`,
        AgentErrorCode.ACTION_FAILED,
        { originalError: error }
      );
    }

    await this.handleStagehandAgentResult(result);
  }

  private async handleStagehandAgentResult(
    result: StagehandAgentResult
  ): Promise<void> {
    const actions: StagehandAgentAction[] = result.actions || [];

    actions.forEach((action, index) => {
      const mapped: AgentAction = {
        id: `stagehand-${Date.now()}-${index}`,
        timestamp: Date.now(),
        functionCall: {
          name: action.type || "stagehand_action",
          args: {
            action,
          },
        },
        status: result.success ? ActionStatus.SUCCESS : ActionStatus.FAILED,
        reasoning: action.reasoning,
        result: {
          pageUrl: (action as any).pageUrl,
          pageText: (action as any).pageText,
        },
      };

      this.context.addAction(mapped);
    });

    try {
      const { screenshot, url } = await this.captureState();
      this.context.setCurrentUrl(url);

      const finalTurn = this.context.getCurrentTurn();
      this.emit("screenshot", {
        turn: finalTurn,
        screenshot: screenshot.toString("base64"),
      });
    } catch (error) {
      console.warn("Failed to capture final state:", error);
    }

    const finalResponse =
      result.message ||
      actions[actions.length - 1]?.reasoning ||
      "Task completed";

    const summaryAction: AgentAction = {
      id: `summary-${Date.now()}`,
      timestamp: Date.now(),
      functionCall: {
        name: "stagehand_agent_complete",
        args: {
          totalSteps: actions.length,
          completed: result.completed,
          success: result.success,
        },
      },
      status: result.success ? ActionStatus.SUCCESS : ActionStatus.FAILED,
      reasoning: finalResponse,
    };

    this.context.addAction(summaryAction);

    this.context.completeTask(finalResponse);
    this.emit("complete", {
      finalResponse,
      duration: this.context.getDuration(),
    });
  }

  private async captureState(): Promise<{ screenshot: Buffer; url: string }> {
    try {
      const screenshot = await this.tools.captureScreenshot();
      const url = await this.tools.getCurrentUrl();

      return { screenshot, url };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new AgentError(
        `Failed to capture state: ${errorMessage}`,
        AgentErrorCode.ACTION_FAILED,
        { originalError: error }
      );
    }
  }

  private setupContextForwarding(): void {
    this.context.on("stateChange", (state: AgentState) => {
      this.emit("stateChange", { state });
    });

    this.context.on("actionAdded", (action: AgentAction) => {
      this.emit("actionAdded", { action });
    });

    this.context.on("actionUpdated", (action: AgentAction) => {
      this.emit("actionUpdated", { action });
    });
  }
}
