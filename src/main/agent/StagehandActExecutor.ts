import type {
  ActResult,
  Action,
  ActOptions,
  ObserveOptions,
} from "@browserbasehq/stagehand";
import type { Page } from "@browserbasehq/stagehand";
import type { Stagehand } from "@browserbasehq/stagehand";
import type { Window } from "../Window";
import { AgentService } from "./AgentService";

/**
 * Normalized result summary for act operations
 */
export interface ActResultSummary {
  success: boolean;
  message: string;
  actionDescription: string;
  actions: Action[];
  error?: string;
}

/**
 * Helper class that wraps Stagehand's observe and act functionality
 * for deterministic, self-healing browser automation.
 */
export class StagehandActExecutor {
  private stagehandService: AgentService;
  private window: Window;
  private page: Page | null = null;

  constructor(window: Window) {
    this.window = window;
    this.stagehandService = AgentService.getInstance();
  }

  /**
   * Get or resolve the Stagehand page for the active tab
   */
  private async getPage(): Promise<Page> {
    if (this.page) {
      return this.page;
    }

    const stagehand = await this.stagehandService.getStagehand();
    this.page = await this.stagehandService.getPageForActiveTab(this.window);
    return this.page;
  }

  /**
   * Observe candidate actions for a given instruction.
   * Returns an array of Action objects that can be executed.
   */
  async observe(
    instruction: string,
    options?: Omit<ObserveOptions, "page">
  ): Promise<Action[]> {
    try {
      const stagehand = await this.stagehandService.getStagehand();
      const page = await this.getPage();

      const result = await stagehand.observe(instruction, {
        ...options,
        page,
      } as ObserveOptions);

      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.error("[StagehandActExecutor] Observe failed:", error);
      throw error;
    }
  }

  /**
   * Execute an act instruction or a pre-observed Action.
   * Can accept either a string instruction or an Action object.
   */
  async act(
    instructionOrAction: string | Action,
    options?: Omit<ActOptions, "page">
  ): Promise<ActResultSummary> {
    try {
      const stagehand = await this.stagehandService.getStagehand();
      const page = await this.getPage();

      const actOptions: ActOptions = {
        ...options,
        page,
      };

      const result: ActResult = await stagehand.act(
        instructionOrAction,
        actOptions
      );

      return {
        success: result.success,
        message: result.message,
        actionDescription: result.actionDescription,
        actions: result.actions || [],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[StagehandActExecutor] Act failed:", errorMessage);

      return {
        success: false,
        message: errorMessage,
        actionDescription:
          typeof instructionOrAction === "string"
            ? instructionOrAction
            : instructionOrAction.description,
        actions: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Convenience method: observe first, then execute the first observed action.
   * Falls back to executing the instruction directly if observation fails or returns no actions.
   */
  async actAfterObserve(
    instruction: string,
    options?: Omit<ActOptions, "page">
  ): Promise<ActResultSummary> {
    try {
      const observedActions = await this.observe(instruction, options);

      if (observedActions.length > 0) {
        const first = observedActions[0];

        console.log(
          `[StagehandActExecutor] Executing observed action: ${first.description}`
        );

        if (first.method === "click" && first.selector) {
          try {
            await this.domClick(first.selector);

            return {
              success: true,
              message: `DOM click executed on selector: ${first.selector}`,
              actionDescription: first.description,
              actions: [first],
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(
              `[StagehandActExecutor] DOM click failed for selector ${first.selector}, falling back to stagehand.act: ${msg}`
            );
            return await this.act(first, options);
          }
        }

        return await this.act(first, options);
      } else {
        console.warn(
          `[StagehandActExecutor] No actions observed, executing instruction directly: ${instruction}`
        );
        return await this.act(instruction, options);
      }
    } catch (error) {
      console.warn(
        `[StagehandActExecutor] Observe failed, falling back to direct act: ${instruction}`,
        error
      );
      return await this.act(instruction, options);
    }
  }

  private async domClick(selector: string): Promise<void> {
    const page = await this.getPage();

    await page.evaluate((sel) => {
      let el: Element | null = null;

      if (sel.startsWith("xpath=")) {
        const xpath = sel.slice("xpath=".length);
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        el = result.singleNodeValue as Element | null;
      } else {
        el = document.querySelector(sel);
      }

      if (!el) {
        throw new Error(`No element found for selector: ${sel}`);
      }

      (el as HTMLElement).click();
    }, selector);
  }

  /**
   * Clear cached page reference (useful for cleanup or when tab changes)
   */
  clearPageCache(): void {
    this.page = null;
  }
}
