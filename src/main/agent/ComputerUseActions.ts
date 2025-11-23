import { Window } from "../Window";
import { StagehandService } from "./StagehandService";

export class ComputerUseActions {
  private window: Window;
  private stagehandService: StagehandService;

  constructor(window: Window) {
    this.window = window;
    this.stagehandService = StagehandService.getInstance();
  }

  private async getActivePage() {
    return this.stagehandService.getActivePage(this.window);
  }

  async captureScreenshot(): Promise<Buffer> {
    const page = await this.getActivePage();
    return await page.screenshot();
  }

  async getCurrentUrl(): Promise<string> {
    const page = await this.getActivePage();
    return page.url();
  }

  async actOnActivePage(
    instruction: string,
    options?: Record<string, unknown>
  ): Promise<unknown> {
    const stagehand = await this.stagehandService.getStagehand();
    const page = await this.getActivePage();

    return stagehand.act(instruction, {
      ...options,
      page,
    } as any);
  }

  async extractOnActivePage<T = unknown>(
    instruction: string,
    schema?: unknown,
    options?: Record<string, unknown>
  ): Promise<T> {
    const stagehand = await this.stagehandService.getStagehand();
    const page = await this.getActivePage();

    if (schema) {
      return stagehand.extract(
        instruction,
        schema as Parameters<typeof stagehand.extract>[1],
        {
          ...options,
          page,
        } as any
      ) as unknown as T;
    }

    return stagehand.extract(instruction, {
      ...options,
      page,
    } as any) as unknown as T;
  }

  async observeOnActivePage(
    instruction?: string,
    options?: Record<string, unknown>
  ): Promise<unknown> {
    const stagehand = await this.stagehandService.getStagehand();
    const page = await this.getActivePage();

    if (typeof instruction === "string") {
      return stagehand.observe(instruction, {
        ...options,
        page,
      } as any);
    }

    if (options) {
      return stagehand.observe({
        ...options,
        page,
      } as any);
    }

    return stagehand.observe({
      page,
    } as any);
  }
}
