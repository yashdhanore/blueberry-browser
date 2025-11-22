import { EventEmitter } from "events";
import { Window } from "../Window";
import { ComputerUseClient } from "./ComputerUseClient";
import { ComputerUseActions } from "./ComputerUseActions";
import { ContextManager } from "./ContextManager";
import { AgentOverlay } from "./AgentOverlay";
import {
  AgentAction,
  GeminiFunctionCall,
  ActionStatus,
  AgentState,
  AgentError,
  AgentErrorCode,
  NavigateArgs,
  ClickAtArgs,
  TypeTextAtArgs,
  HoverAtArgs,
  ScrollDocumentArgs,
  ScrollAtArgs,
  KeyCombinationArgs,
} from "./ComputerUseTypes";

export class AgentOrchestrator extends EventEmitter {
  private gemini: ComputerUseClient;
  private tools: ComputerUseActions;
  private context: ContextManager;
  private overlay: AgentOverlay | null = null;
  private window: Window;
  private isRunning: boolean = false;
  private shouldStop: boolean = false;

  // Track last action for function response
  private lastActionName: string = "";
  private lastActionResult: any = null;

  constructor(window: Window, geminiApiKey?: string) {
    super();

    this.window = window;
    this.gemini = new ComputerUseClient(geminiApiKey);
    this.tools = new ComputerUseActions(window);
    this.context = new ContextManager();

    // Forward context events
    this.setupContextForwarding();
  }

  async startTask(goal: string): Promise<void> {
    if (this.isRunning) {
      throw new Error("Agent is already running a task");
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.lastActionName = "";
    this.lastActionResult = null;

    try {
      const activeTab = this.window.activeTab;
      if (activeTab) {
        this.overlay = new AgentOverlay(activeTab.webContents);
        await this.overlay.inject();
      }

      // Start the task in context
      this.context.startTask(goal);
      this.emit("start", { goal });

      // Update overlay
      if (this.overlay) {
        await this.overlay.update({ type: "start", data: { goal } });
      }

      // Reset Gemini conversation
      this.gemini.resetConversation();

      // Run the main loop
      await this.runLoop();
    } catch (error) {
      console.error("Agent error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.context.failTask(errorMessage);
      this.emit("error", {
        error: errorMessage,
        turn: this.context.getCurrentTurn(),
      });

      // Update overlay with error
      if (this.overlay) {
        await this.overlay.update({
          type: "error",
          data: { error: errorMessage },
        });
      }
    } finally {
      this.isRunning = false;

      // Remove overlay after a delay
      if (this.overlay) {
        setTimeout(async () => {
          await this.overlay?.remove();
          this.overlay = null;
        }, 3000);
      }
    }
  }

  async cancelTask(): Promise<void> {
    if (!this.isRunning) {
      throw new Error("No task is running");
    }

    this.shouldStop = true;
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

  /**
   * Resume a paused task
   */
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

  /**
   * Main agent loop
   */
  private async runLoop(): Promise<void> {
    while (this.shouldContinue()) {
      // Check for pause
      if (this.context.isPaused()) {
        await this.waitForResume();
        continue;
      }

      // Check for cancellation
      if (this.shouldStop) {
        return;
      }

      try {
        const isComplete = await this.executeTurn();
        if (isComplete) {
          this.context.completeTask();
          this.emit("complete", {
            finalResponse: this.context.getContext().finalResponse,
            duration: this.context.getDuration(),
          });
          return;
        }
      } catch (error) {
        console.error("Turn error:", error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.context.recordError(errorMessage);

        if (!this.context.canRetry()) {
          this.context.failTask(errorMessage);
          this.emit("error", {
            error: errorMessage,
            turn: this.context.getCurrentTurn(),
          });
          return;
        }

        await this.tools.wait(1);
      }
    }

    // If we exit the loop without completing, check why
    if (this.context.hasReachedMaxTurns()) {
      const error = "Task exceeded maximum turns";
      this.context.failTask(error);
      this.emit("error", { error, turn: this.context.getCurrentTurn() });
    } else if (this.context.hasTimedOut()) {
      const error = "Task timed out";
      this.context.failTask(error);
      this.emit("error", { error, turn: this.context.getCurrentTurn() });
    }
  }

  private async executeTurn(): Promise<boolean> {
    const turn = this.context.getCurrentTurn();
    this.emit("turn", { turn });

    if (this.overlay) {
      await this.overlay.update({ type: "turn", data: { turn } });
    }

    const { screenshot, url } = await this.captureState();
    this.context.setCurrentUrl(url);
    this.emit("screenshot", { turn });

    if (this.overlay && screenshot) {
      await this.overlay.update({
        type: "screenshot",
        data: { screenshot: screenshot.toString("base64") },
      });
    }

    const isInitial = turn === 1;
    const response = isInitial
      ? await this.gemini.planNextAction({
          screenshot,
          currentUrl: url,
          userGoal: this.context.getGoal(),
          previousActions: this.context.getActionHistory(),
          isInitial: true,
        })
      : await this.gemini.sendFunctionResponse({
          functionName: this.lastActionName,
          result: this.lastActionResult,
          newScreenshot: screenshot,
          newUrl: url,
        });

    this.emit("reasoning", { reasoning: response.reasoning, turn });

    if (this.overlay) {
      await this.overlay.update({
        type: "reasoning",
        data: { reasoning: response.reasoning },
      });
    }

    if (response.isComplete) {
      this.context.completeTask(response.finalResponse);

      if (this.overlay) {
        await this.overlay.update({
          type: "complete",
          data: { finalResponse: response.finalResponse },
        });
      }

      return true;
    }

    for (const call of response.functionCalls) {
      await this.executeAndTrackAction(call, turn);
    }

    return false;
  }

  /**
   * Execute a single action and track it
   */
  private async executeAndTrackAction(
    call: GeminiFunctionCall,
    turn: number
  ): Promise<void> {
    this.emit("action", {
      name: call.name,
      args: call.args,
      turn,
    });

    // Update overlay with action
    if (this.overlay) {
      await this.overlay.update({
        type: "action",
        data: { name: call.name, args: call.args },
      });
    }

    // Create action record
    const action: AgentAction = {
      id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      functionCall: call,
      status: ActionStatus.IN_PROGRESS,
      reasoning: "",
    };

    this.context.addAction(action);

    try {
      // Execute the action
      const result = await this.executeAction(call);

      // Update action record
      this.context.markLastActionSuccess(result);

      // Capture state after action
      const { screenshot, url } = await this.captureState();
      this.context.updateLastAction({
        screenshot: screenshot.toString("base64"),
        url,
      });

      this.emit("actionComplete", {
        name: call.name,
        result,
        success: result.success !== false,
      });

      // Update overlay with action completion
      if (this.overlay) {
        await this.overlay.update({
          type: "actionComplete",
          data: { success: result.success !== false, result },
        });
      }

      // Store for next turn
      this.lastActionName = call.name;
      this.lastActionResult = result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.context.markLastActionFailed(errorMessage);

      this.emit("actionComplete", {
        name: call.name,
        result: { success: false, error: errorMessage },
        success: false,
      });

      // Update overlay with action failure
      if (this.overlay) {
        await this.overlay.update({
          type: "actionComplete",
          data: { success: false, result: { error: errorMessage } },
        });
      }

      throw error;
    }
  }

  /**
   * Execute a Gemini function call via MCP Tools
   */
  private async executeAction(call: GeminiFunctionCall): Promise<any> {
    const { name, args } = call;

    console.log(`Executing action: ${name}`, args);

    switch (name) {
      case "open_web_browser":
        return { success: true, message: "Browser already open" };

      case "navigate":
        return await this.tools.navigate((args as NavigateArgs).url);

      case "click_at":
        const clickArgs = args as ClickAtArgs;
        return await this.tools.clickAt(clickArgs.x, clickArgs.y);

      case "type_text_at":
        const typeArgs = args as TypeTextAtArgs;
        return await this.tools.typeTextAt({
          x: typeArgs.x,
          y: typeArgs.y,
          text: typeArgs.text,
          pressEnter: (typeArgs as any).press_enter || false,
          clearFirst: (typeArgs as any).clear_first !== false,
        });

      case "hover_at":
        const hoverArgs = args as HoverAtArgs;
        return await this.tools.hoverAt(hoverArgs.x, hoverArgs.y);

      case "scroll_document":
        const scrollDocArgs = args as ScrollDocumentArgs;
        return await this.tools.scrollDocument(
          scrollDocArgs.scroll_amount > 0 ? "down" : "up"
        );

      case "scroll_at":
        const scrollArgs = args as ScrollAtArgs;
        return await this.tools.scrollAt({
          x: scrollArgs.x,
          y: scrollArgs.y,
          direction: scrollArgs.scroll_amount > 0 ? "down" : "up",
          magnitude: Math.abs(scrollArgs.scroll_amount || 500),
        });

      case "key_combination":
        const keyArgs = args as KeyCombinationArgs;
        const keys = Array.isArray(keyArgs.keys)
          ? keyArgs.keys.join("+")
          : keyArgs.keys;
        return await this.tools.keyCombo(keys);

      case "go_back":
        return await this.tools.goBack();

      case "go_forward":
        return await this.tools.goForward();

      case "wait_5_seconds":
        await this.tools.wait(5);
        return { success: true };

      default:
        console.warn(`Unknown action: ${name}`);
        return {
          success: false,
          error: `Unknown action: ${name}`,
        };
    }
  }

  /**
   * Capture current page state
   */
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

  private shouldContinue(): boolean {
    if (this.shouldStop) {
      return false;
    }

    return this.context.shouldContinue();
  }

  private async waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      const checkResume = () => {
        if (!this.context.isPaused() || this.shouldStop) {
          resolve();
        } else {
          setTimeout(checkResume, 100);
        }
      };
      checkResume();
    });
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
