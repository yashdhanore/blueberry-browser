import { Window } from "../Window";
import { StagehandService } from "./StagehandService";
import {
  COORDINATE_RANGE,
  ScrollAtParams,
  ToolResult,
  TypeParams,
} from "./ComputerUseTypes";

export class ComputerUseActions {
  private window: Window;
  private stagehandService: StagehandService;

  constructor(window: Window) {
    this.window = window;
    this.stagehandService = StagehandService.getInstance();
  }

  private async getStagehandPage() {
    return this.stagehandService.getPageForActiveTab(this.window);
  }

  async denormalizeCoords(
    normalizedX: number,
    normalizedY: number
  ): Promise<{ x: number; y: number }> {
    const viewport = await this.getViewportSize();

    const x = Math.round((normalizedX / COORDINATE_RANGE) * viewport.width);
    const y = Math.round((normalizedY / COORDINATE_RANGE) * viewport.height);

    return { x, y };
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

  async clickAt(normalizedX: number, normalizedY: number): Promise<ToolResult> {
    try {
      const { x, y } = await this.denormalizeCoords(normalizedX, normalizedY);
      const page = await this.getStagehandPage();

      await page.click(x, y);

      await this.waitForPageSettle();

      const info = await this.getElementInfoAt(x, y);

      return {
        success: true,
        data: info,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async typeTextAt(params: TypeParams): Promise<ToolResult> {
    try {
      const { x, y, text, pressEnter = false, clearFirst = true } = params;
      const page = await this.getStagehandPage();

      await page.click(x, y);
      await this.wait(0.1);

      if (clearFirst) {
        // Select all and delete
        const modifier = process.platform === "darwin" ? "Meta" : "Control";
        await page.keyPress(`${modifier}+A`);
        await this.wait(0.1);
        await page.keyPress("Backspace");
      }

      await page.type(text);

      if (pressEnter) {
        await this.wait(0.1);
        await page.keyPress("Enter");
      }

      await this.waitForPageSettle();

      return {
        success: true,
        data: { text },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async hoverAt(normalizedX: number, normalizedY: number): Promise<ToolResult> {
    try {
      const { x, y } = await this.denormalizeCoords(normalizedX, normalizedY);
      const page = await this.getStagehandPage();

      await page.evaluate(
        (coords) => {
          const el = document.elementFromPoint(coords.x, coords.y);
          if (el) {
            const event = new MouseEvent("mouseover", {
              view: window,
              bubbles: true,
              cancelable: true,
            });
            el.dispatchEvent(event);
          }
        },
        { x, y }
      );

      await this.wait(0.2);

      const info = await this.getElementInfoAt(x, y);

      return {
        success: true,
        data: info,
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

      return {
        success: true,
        data: {
          method: "scroll",
          direction: direction,
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

      const { x: denormX, y: denormY } = await this.denormalizeCoords(x, y);

      const viewport = await this.getViewportSize();
      const scrollAmount =
        (params.magnitude || 1) *
        Math.min(viewport.height, viewport.width) *
        0.3;

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

      await page.scroll(denormX, denormY, deltaX, deltaY);

      await this.wait(0.3);

      return {
        success: true,
        data: {
          method: "scroll",
          direction: direction,
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
    return await page.screenshot();
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

  private async getElementInfoAt(
    x: number,
    y: number
  ): Promise<Record<string, any>> {
    try {
      const page = await this.getStagehandPage();
      return await page.evaluate(
        (coords) => {
          const el = document.elementFromPoint(
            coords.x,
            coords.y
          ) as HTMLElement | null;
          if (!el) return { tagName: "unknown" };
          const anchorEl = el.closest("a") as HTMLAnchorElement | null;
          const anchor =
            (el as HTMLAnchorElement).href || anchorEl?.href || undefined;
          return {
            tagName: el.tagName,
            id: el.id || undefined,
            className: el.className || undefined,
            text: el.innerText?.slice(0, 50),
            href: anchor,
          };
        },
        { x, y }
      );
    } catch {
      return { tagName: "unknown" };
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
