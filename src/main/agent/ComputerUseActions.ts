import { Window } from "../Window";
import { Tab } from "../Tab";
import {
  COORDINATE_RANGE,
  ScrollAtParams,
  ToolResult,
  TypeParams,
} from "./ComputerUseTypes";

export class ComputerUseActions {
  private window: Window;

  constructor(window: Window) {
    this.window = window;
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
      const tab = this.getActiveTab();

      let finalUrl = url;
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        finalUrl = "https://" + url;
      }

      await tab.loadURL(finalUrl);
      await this.waitForPageSettle();

      const currentUrl = await this.getCurrentUrl();

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
      const tab = this.getActiveTab();

      if (!tab.webContents.navigationHistory.canGoBack()) {
        return {
          success: false,
          error: "Cannot go back",
        };
      }

      tab.goBack();
      await this.waitForPageSettle();

      const currentUrl = await this.getCurrentUrl();

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
      const tab = this.getActiveTab();

      if (!tab.webContents.navigationHistory.canGoForward()) {
        return {
          success: false,
          error: "Cannot go forward",
        };
      }

      tab.goForward();
      await this.waitForPageSettle();

      const currentUrl = await this.getCurrentUrl();

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
      const tab = this.getActiveTab();

      tab.webContents.sendInputEvent({
        type: "mouseDown",
        x,
        y,
        button: "left",
        clickCount: 1,
      });

      tab.webContents.sendInputEvent({
        type: "mouseUp",
        x,
        y,
        button: "left",
        clickCount: 1,
      });

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

      const clickResult = await this.clickAt(x, y);
      if (!clickResult.success) {
        return clickResult;
      }

      await this.wait(0.1);

      if (clearFirst) {
        await this.selectAll();
        await this.pressKey("Backspace");
      }

      const tab = this.getActiveTab();
      tab.webContents.insertText(text);

      if (pressEnter) {
        await this.wait(0.1);
        await this.pressKey("Return");
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
      const tab = this.getActiveTab();

      tab.webContents.sendInputEvent({
        type: "mouseMove",
        x,
        y,
      });

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
      const tab = this.getActiveTab();

      let keyCode: string;
      if (direction === "down") {
        keyCode = "PageDown";
      } else if (direction === "up") {
        keyCode = "PageUp";
      } else if (direction === "right") {
        keyCode = "Right";
      } else {
        keyCode = "Left";
      }

      tab.webContents.sendInputEvent({
        type: "keyDown",
        keyCode: keyCode,
      });

      tab.webContents.sendInputEvent({
        type: "keyUp",
        keyCode: keyCode,
      });

      await this.wait(0.3);

      return {
        success: true,
        data: {
          method: "keyboard",
          key: keyCode,
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

      // For scrollAt, just use the same keyboard approach
      return await this.scrollDocument(direction);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async keyCombo(keys: string): Promise<ToolResult> {
    try {
      const tab = this.getActiveTab();

      const parts = keys.split("+");
      const key = parts[parts.length - 1];
      const modifierParts = parts.slice(0, -1).map((m) => m.toLowerCase());

      const electronModifiers: Array<"shift" | "control" | "alt" | "meta"> = [];
      if (modifierParts.includes("control") || modifierParts.includes("ctrl")) {
        electronModifiers.push("control");
      }
      if (modifierParts.includes("shift")) {
        electronModifiers.push("shift");
      }
      if (modifierParts.includes("alt")) {
        electronModifiers.push("alt");
      }
      if (
        modifierParts.includes("meta") ||
        modifierParts.includes("cmd") ||
        modifierParts.includes("command")
      ) {
        electronModifiers.push("meta");
      }

      const keyCode = this.mapKeyToElectronCode(key);

      tab.webContents.sendInputEvent({
        type: "keyDown",
        keyCode,
        modifiers: electronModifiers,
      });

      tab.webContents.sendInputEvent({
        type: "keyUp",
        keyCode,
        modifiers: electronModifiers,
      });

      await this.waitForPageSettle();

      return {
        success: true,
        data: { key: keyCode, modifiers: electronModifiers },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async captureScreenshot(): Promise<Buffer> {
    const tab = this.getActiveTab();
    const image = await tab.screenshot();
    return image.toPNG();
  }

  async getCurrentUrl(): Promise<string> {
    const tab = this.getActiveTab();
    return tab.url;
  }

  async getPageTitle(): Promise<string> {
    const tab = this.getActiveTab();
    return tab.title;
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
      const result = await this.executeJS(jsCode);
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

  private getActiveTab(): Tab {
    const tab = this.window.activeTab;
    if (!tab) {
      throw new Error("No active tab");
    }
    return tab;
  }

  private async executeJS(code: string): Promise<any> {
    const tab = this.getActiveTab();
    return await tab.webContents.executeJavaScript(code);
  }

  private async waitForPageSettle(): Promise<void> {
    await this.wait(0.3);

    const jsCode = `
      new Promise(resolve => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', resolve, { once: true });
          setTimeout(resolve, 1000);
        }
      })
    `;

    try {
      await Promise.race([this.executeJS(jsCode), this.wait(2)]);
    } catch {}
  }

  private async pressKey(keyCode: string): Promise<void> {
    const tab = this.getActiveTab();
    tab.webContents.sendInputEvent({ type: "keyDown", keyCode });
    tab.webContents.sendInputEvent({ type: "keyUp", keyCode });
  }

  private async selectAll(): Promise<void> {
    const tab = this.getActiveTab();
    const modifier: "meta" | "control" =
      process.platform === "darwin" ? "meta" : "control";
    tab.webContents.sendInputEvent({
      type: "keyDown",
      keyCode: "A",
      modifiers: [modifier],
    });
    tab.webContents.sendInputEvent({
      type: "keyUp",
      keyCode: "A",
      modifiers: [modifier],
    });
  }

  private async getElementInfoAt(
    x: number,
    y: number
  ): Promise<Record<string, any>> {
    try {
      return await this.executeJS(`
        (function() {
          const el = document.elementFromPoint(${x}, ${y});
          if (!el) return { tagName: 'unknown' };
          return {
            tagName: el.tagName,
            id: el.id || undefined,
            className: el.className || undefined,
            text: el.innerText?.slice(0, 50) || undefined,
            href: el.href || el.closest('a')?.href || undefined
          };
        })()
      `);
    } catch {
      return { tagName: "unknown" };
    }
  }

  private mapKeyToElectronCode(key: string): string {
    const keyMap: Record<string, string> = {
      enter: "Return",
      return: "Return",
      escape: "Escape",
      esc: "Escape",
      tab: "Tab",
      backspace: "Backspace",
      delete: "Delete",
      space: "Space",
      arrowup: "Up",
      arrowdown: "Down",
      arrowleft: "Left",
      arrowright: "Right",
      up: "Up",
      down: "Down",
      left: "Left",
      right: "Right",
      home: "Home",
      end: "End",
      pageup: "PageUp",
      pagedown: "PageDown",
    };
    return keyMap[key.toLowerCase()] || key;
  }

  private async getViewportSize(): Promise<{ width: number; height: number }> {
    return await this.executeJS(
      "({ width: window.innerWidth, height: window.innerHeight })"
    );
  }
}
