import { Window } from "../Window";
import { AgentService } from "./AgentService";
import { ScrollAtParams, ToolResult } from "./ComputerUseTypes";

export class ComputerUseActions {
  private window: Window;
  private stagehandService: AgentService;

  constructor(window: Window) {
    this.window = window;
    this.stagehandService = AgentService.getInstance();
  }

  private async getStagehandPage() {
    return this.stagehandService.getPageForActiveTab(this.window);
  }

  async navigate(url: string): Promise<ToolResult> {
    try {
      const page = await this.getStagehandPage();

      let finalUrl = url;
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        finalUrl = "https://" + url;
      }

      await page.goto(finalUrl, {
        waitUntil: "networkidle",
      });

      const currentUrl = page.url();

      return {
        success: true,
        data: { url: currentUrl },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async goBack(): Promise<ToolResult> {
    try {
      const page = await this.getStagehandPage();

      await page.goBack({
        waitUntil: "networkidle",
      });

      const currentUrl = page.url();

      return {
        success: true,
        data: { url: currentUrl },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async goForward(): Promise<ToolResult> {
    try {
      const page = await this.getStagehandPage();

      await page.goForward({
        waitUntil: "networkidle",
      });

      const currentUrl = page.url();

      return {
        success: true,
        data: { url: currentUrl },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async scrollDocument(
    direction: "up" | "down" | "left" | "right"
  ): Promise<ToolResult> {
    try {
      const page = await this.getStagehandPage();

      const viewport = await this.getViewportSize();
      const scrollAmount = Math.min(viewport.height, viewport.width) * 0.8;

      let deltaX = 0;
      let deltaY = 0;

      if (direction === "down") {
        deltaY = scrollAmount;
      } else if (direction === "up") {
        deltaY = -scrollAmount;
      } else if (direction === "right") {
        deltaX = scrollAmount;
      } else {
        deltaX = -scrollAmount;
      }

      await page.scroll(
        viewport.width / 2,
        viewport.height / 2,
        deltaX,
        deltaY
      );

      await this.wait(0.3);

      const visibleLinks = await page.evaluate(() => {
        const links = Array.from(
          document.querySelectorAll("a[href]")
        ) as HTMLAnchorElement[];
        return links
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= window.innerHeight;
          })
          .slice(0, 20)
          .map((el) => ({ text: el.textContent?.trim(), href: el.href }));
      });

      return {
        success: true,
        data: {
          method: "scroll",
          direction: direction,
          visibleLinks,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async scrollAt(params: ScrollAtParams): Promise<ToolResult> {
    try {
      const { x, y, direction } = params;
      const page = await this.getStagehandPage();

      const viewport = await this.getViewportSize();
      const scrollAmount =
        (params.magnitude || 1) *
        Math.min(viewport.height, viewport.width) *
        0.3;

      let deltaX = 0;
      let deltaY = 0;

      if (direction === "down") deltaY = scrollAmount;
      else if (direction === "up") deltaY = -scrollAmount;
      else if (direction === "right") deltaX = scrollAmount;
      else deltaX = -scrollAmount;

      // x/y are already pixel coords from Stagehand's CUA layer
      const scrollX =
        typeof x === "number" ? x : Math.round(viewport.width / 2);
      const scrollY =
        typeof y === "number" ? y : Math.round(viewport.height / 2);

      await page.scroll(scrollX, scrollY, deltaX, deltaY);
      await this.wait(0.3);

      return {
        success: true,
        data: {
          method: "scroll",
          direction,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async keyCombo(keys: string): Promise<ToolResult> {
    try {
      const page = await this.getStagehandPage();

      await page.keyPress(keys);

      await this.waitForPageSettle();

      return {
        success: true,
        data: { key: keys },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async captureScreenshot(): Promise<Buffer> {
    const page = await this.getStagehandPage();
    // Use CSS scale to match Stagehand's coordinate system
    return await page.screenshot({ fullPage: false, scale: "css" });
  }

  async getCurrentUrl(): Promise<string> {
    const page = await this.getStagehandPage();
    return page.url();
  }

  async getPageTitle(): Promise<string> {
    const page = await this.getStagehandPage();
    return await page.title();
  }

  async getPageSnapshot(): Promise<ToolResult> {
    const jsCode = `
      (function() {
        const elements = [];

        const interactiveSelectors = [
          'a[href]',
          'button',
          'input',
          'textarea',
          'select',
          '[role="button"]',
          '[role="link"]',
          '[role="textbox"]',
          '[onclick]'
        ];

        const interactiveElements = document.querySelectorAll(interactiveSelectors.join(','));

        interactiveElements.forEach((el, index) => {
          if (index > 100) return;

          const rect = el.getBoundingClientRect();

          if (rect.width === 0 || rect.height === 0) return;
          if (rect.top > window.innerHeight || rect.bottom < 0) return;

          elements.push({
            type: el.tagName.toLowerCase(),
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
            text: el.textContent ? el.textContent.trim().slice(0, 100) : '',
            value: el.value || '',
            bounds: {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            attributes: {
              id: el.id,
              class: el.className,
              href: el.href || '',
              type: el.type || '',
              placeholder: el.placeholder || ''
            }
          });
        });

        return {
          success: true,
          data: {
            url: window.location.href,
            title: document.title,
            elements: elements,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
              scrollX: window.scrollX,
              scrollY: window.scrollY
            }
          }
        };
      })()
    `;

    try {
      const page = await this.getStagehandPage();
      const result = await page.evaluate(jsCode);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async wait(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  private async waitForPageSettle(): Promise<void> {
    try {
      const page = await this.getStagehandPage();
      await page.waitForLoadState("networkidle", 2000);
    } catch {
      await this.wait(0.3);
    }
  }

  private async getViewportSize(): Promise<{ width: number; height: number }> {
    const page = await this.getStagehandPage();
    return await page.evaluate(
      "({ width: window.innerWidth, height: window.innerHeight })"
    );
  }

  async actOnActivePage(
    instruction: string,
    options?: Record<string, any>
  ): Promise<any> {
    const stagehand = await this.stagehandService.getStagehand();
    const page = await this.getStagehandPage();

    return stagehand.act(instruction, {
      ...options,
      page,
    } as any);
  }

  async extractOnActivePage<T = unknown>(
    instruction: string,
    schema?: any,
    options?: Record<string, any>
  ): Promise<T> {
    const stagehand = await this.stagehandService.getStagehand();
    const page = await this.getStagehandPage();

    if (schema) {
      return stagehand.extract(instruction, schema, {
        ...options,
        page,
      } as any) as unknown as T;
    }

    return stagehand.extract(instruction, {
      ...options,
      page,
    } as any) as unknown as T;
  }

  async observeOnActivePage(
    instruction?: string,
    options?: Record<string, any>
  ): Promise<any> {
    const stagehand = await this.stagehandService.getStagehand();
    const page = await this.getStagehandPage();

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
