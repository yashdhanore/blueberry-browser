import { Tab } from "./Tab";
import { ActionResult } from "./ComputerUseTypes";

export class ComputerUseActions {
  private screenWidth: number;
  private screenHeight: number;

  constructor(screenWidth: number = 1440, screenHeight: number = 900) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
  }

  public denormalizeX(x: number): number {
    return Math.round((x / 1000) * this.screenWidth);
  }

  public denormalizeY(y: number): number {
    return Math.round((y / 1000) * this.screenHeight);
  }

  async clickAt(tab: Tab, x: number, y: number): Promise<ActionResult> {
    const actualX = this.denormalizeX(x);
    const actualY = this.denormalizeY(y);

    const code = `
      (function() {
        const element = document.elementFromPoint(${actualX}, ${actualY});
        if (element) {
          element.click();
          return { success: true };
        }
        return { success: false, error: 'No element at coordinates' };
      })();
    `;

    const result = await tab.runJs(code);
    return result;
  }

  public delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async hoverAt(tab: Tab, x: number, y: number): Promise<ActionResult> {
    const actualX = this.denormalizeX(x);
    const actualY = this.denormalizeY(y);

    const code = `
      (function() {
        const element = document.elementFromPoint(${actualX}, ${actualY});
        if (element) {
          const event = new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          element.dispatchEvent(event);
          return { success: true };
        }
        return { success: false, error: 'No element at coordinates' };
      })();
    `;

    const result = await tab.runJs(code);
    return result;
  }

  public async captureScreenshot(tab: Tab): Promise<string> {
    const image = await tab.screenshot();
    const buffer = image.toPNG();
    return buffer.toString("base64");
  }

  public async typeTextAt(
    tab: Tab,
    x: number,
    y: number,
    text: string,
    pressEnter: boolean,
    clearBefore: boolean
  ): Promise<ActionResult> {
    const actualX = this.denormalizeX(x);
    const actualY = this.denormalizeY(y);

    const escapedText = text.replace(/\\/g, "\\\\").replace(/`/g, "\\`");

    const code = `
      (function() {
        const element = document.elementFromPoint(${actualX}, ${actualY});
        if (!element) {
          return { success: false, error: 'No element at coordinates' };
        }

        // Click to focus
        element.click();
        element.focus();

        // Clear if needed
        ${
          clearBefore
            ? `
        if (element.value !== undefined) {
          element.value = '';
        } else {
          element.textContent = '';
        }
        `
            : ""
        }

        // Set value
        if (element.value !== undefined) {
          element.value = \`${escapedText}\`;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          element.textContent = \`${escapedText}\`;
        }

        // Press enter if needed
        ${
          pressEnter
            ? `
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          bubbles: true
        });
        element.dispatchEvent(enterEvent);
        `
            : ""
        }

        return { success: true };
      })();
    `;

    const result = await tab.runJs(code);
    return result;
  }

  public async keyCombo(tab: Tab, keys: string): Promise<ActionResult> {
    const code = `
      (function() {
        const parts = '${keys}'.toLowerCase().split('+');
        const event = new KeyboardEvent('keydown', {
          key: parts[parts.length - 1],
          ctrlKey: parts.includes('control') || parts.includes('ctrl'),
          shiftKey: parts.includes('shift'),
          altKey: parts.includes('alt'),
          metaKey: parts.includes('meta') || parts.includes('cmd'),
          bubbles: true
        });
        document.dispatchEvent(event);
        return { success: true };
      })();
    `;

    const result = await tab.runJs(code);
    return result;
  }

  public async scrollDocument(
    tab: Tab,
    direction: string
  ): Promise<ActionResult> {
    const scrollAmount = direction === "up" || direction === "down" ? 500 : 500;
    const scrollX =
      direction === "right"
        ? scrollAmount
        : direction === "left"
          ? -scrollAmount
          : 0;
    const scrollY =
      direction === "down"
        ? scrollAmount
        : direction === "up"
          ? -scrollAmount
          : 0;

    const code = `
      (function() {
        window.scrollBy(${scrollX}, ${scrollY});
        return { success: true };
      })();
    `;

    const result = await tab.runJs(code);
    return result;
  }

  public async scrollAt(
    tab: Tab,
    x: number,
    y: number,
    direction: string,
    magnitude: number
  ): Promise<ActionResult> {
    const actualX = this.denormalizeX(x);
    const actualY = this.denormalizeY(y);
    const actualMagnitude = this.denormalizeY(magnitude);

    const scrollX =
      direction === "right"
        ? actualMagnitude
        : direction === "left"
          ? -actualMagnitude
          : 0;
    const scrollY =
      direction === "down"
        ? actualMagnitude
        : direction === "up"
          ? -actualMagnitude
          : 0;

    const code = `
      (function() {
        const element = document.elementFromPoint(${actualX}, ${actualY});
        if (element) {
          element.scrollBy(${scrollX}, ${scrollY});
          return { success: true };
        }
        return { success: false, error: 'No element at coordinates' };
      })();
    `;

    const result = await tab.runJs(code);
    return result;
  }

  public async dragAndDrop(
    tab: Tab,
    x: number,
    y: number,
    destX: number,
    destY: number
  ): Promise<ActionResult> {
    const actualX = this.denormalizeX(x);
    const actualY = this.denormalizeY(y);
    const actualDestX = this.denormalizeX(destX);
    const actualDestY = this.denormalizeY(destY);

    const code = `
      (function() {
        const source = document.elementFromPoint(${actualX}, ${actualY});
        if (!source) {
          return { success: false, error: 'No element at source coordinates' };
        }

        const dataTransfer = new DataTransfer();

        const dragStart = new DragEvent('dragstart', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer
        });
        source.dispatchEvent(dragStart);

        const drop = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
          clientX: ${actualDestX},
          clientY: ${actualDestY}
        });
        const target = document.elementFromPoint(${actualDestX}, ${actualDestY});
        if (target) {
          target.dispatchEvent(drop);
        }

        const dragEnd = new DragEvent('dragend', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer
        });
        source.dispatchEvent(dragEnd);

        return { success: true };
      })();
    `;

    const result = await tab.runJs(code);
    return result;
  }
}
