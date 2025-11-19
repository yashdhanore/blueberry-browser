import { WebContents } from "electron";
import { GoogleGenAI, Environment, FunctionCall } from "@google/genai";
import * as dotenv from "dotenv";
import { join } from "path";
import type { Window } from "./Window";
import type { Tab } from "./Tab";
import { ActionResult, ComputerUseRequest } from "./ComputerUseTypes";
import { ComputerUseActions } from "./ComputerUseActions";
dotenv.config({ path: join(__dirname, "../../.env") });

const MODEL_NAME = "gemini-2.5-computer-use-preview-10-2025";
const SCREEN_WIDTH = 1440;
const SCREEN_HEIGHT = 900;
const MAX_TURNS = 20;

export class ComputerUseClient {
  private readonly webContents: WebContents;
  private window: Window | null = null;
  private readonly client: GoogleGenAI | null;
  private conversationHistory: any[] = [];
  private isRunning = false;
  private actions: ComputerUseActions;

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    this.client = this.initializeClient();
    this.actions = new ComputerUseActions(SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  private initializeClient(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error(
        `Computer Use Client initialization failed: GEMINI_API_KEY not found in environment variables.\n` +
          `Please add your Gemini API key to the .env file in the project root.`
      );
      return null;
    }
    const client = new GoogleGenAI({ apiKey });
    console.log(
      `Computer Use Client initialized with Gemini model: ${MODEL_NAME}`
    );
    return client;
  }

  async executeTask(request: ComputerUseRequest): Promise<void> {
    if (!this.client) {
      this.sendError(request.messageId, "Computer Use is not configured");
      return;
    }

    if (!this.window || !this.window.activeTab) {
      this.sendError(request.messageId, "No active tab available.");
      return;
    }

    if (this.isRunning) {
      this.sendError(
        request.messageId,
        "Another Computer Use task is already running."
      );
      return;
    }

    this.isRunning = true;
    this.conversationHistory = [];

    try {
      await this.runAgentLoop(request);
    } catch (error) {
      console.error("Error in Computer Use task:", error);
      this.sendError(
        request.messageId,
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    } finally {
      this.isRunning = false;
    }
  }

  private async runAgentLoop(request: ComputerUseRequest): Promise<void> {
    const tab = this.window!.activeTab!;
    const screenshot = await this.actions.captureScreenshot(tab);

    this.conversationHistory.push({
      role: "user",
      parts: [
        { text: request.prompt },
        {
          inlineData: {
            mimeType: "image/png",
            data: screenshot,
          },
        },
      ],
    });

    this.sendStatus(request.messageId, `Starting task: ${request.prompt}`);
    // loop
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      this.sendStatus(request.messageId, `Turn ${turn + 1}/${MAX_TURNS}...`);

      const response = await this.client!.models.generateContent({
        model: MODEL_NAME,
        contents: this.conversationHistory,
        config: {
          tools: [
            {
              computerUse: {
                environment: Environment.ENVIRONMENT_BROWSER,
              },
            },
          ],
        },
      });

      const candidate = response.candidates?.[0];
      if (!candidate) {
        this.sendStatus(request.messageId, "No response from model.");
        break;
      }

      // Add response to history
      this.conversationHistory.push({
        role: "model",
        parts: candidate.content?.parts,
      });

      const functionCalls = this.extractFunctionCalls(candidate);

      if (functionCalls.length === 0) {
        // No more actions - task complete
        const textResponse = this.extractText(candidate);
        this.sendComplete(request.messageId, textResponse || "Task completed.");
        break;
      }

      const results = await this.executeFunctionCalls(
        functionCalls,
        tab,
        request.messageId
      );

      // Capture new screenshot after actions
      const newScreenshot = await this.actions.captureScreenshot(tab);
      const currentUrl = tab.url;

      // Build function response
      const functionResponseParts = results.map((result, index) => ({
        functionResponse: {
          name: functionCalls[index].name,
          response: {
            url: currentUrl,
            success: result.success,
            ...(result.error && { error: result.error }),
          },
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: newScreenshot,
              },
            },
          ],
        },
      }));

      this.conversationHistory.push({
        role: "user",
        parts: functionResponseParts,
      });
    }
  }

  private async executeFunctionCalls(
    calls: FunctionCall[],
    tab: Tab,
    messageId: string
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const call of calls) {
      this.sendStatus(messageId, `Executing: ${call.name}`);
      const result = await this.executeAction(call, tab);
      results.push(result);

      if (!result.success) {
        this.sendStatus(messageId, `Action failed: ${result.error}`);
      }

      // Wait for page to settle after action
      await this.actions.delay(1000);
    }

    return results;
  }

  private extractText(candidate: any): string | null {
    if (!candidate.content?.parts) return null;

    const textParts: string[] = [];
    for (const part of candidate.content.parts) {
      if (part.text) {
        textParts.push(part.text);
      }
    }

    return textParts.length > 0 ? textParts.join("\n") : null;
  }

  private extractFunctionCalls(candidate: any): FunctionCall[] {
    const calls: FunctionCall[] = [];

    if (!candidate.content?.parts) return calls;

    for (const part of candidate.content.parts) {
      if (part.functionCall) {
        calls.push({
          name: part.functionCall.name,
          args: part.functionCall.args || {},
        });
      }
    }

    return calls;
  }

  private async clickAt(tab: Tab, x: number, y: number): Promise<ActionResult> {
    return await this.actions.clickAt(tab, x, y);
  }

  private async executeAction(
    call: FunctionCall,
    tab: Tab
  ): Promise<ActionResult> {
    try {
      const { name, args = {} } = call;

      switch (name) {
        case "open_web_browser":
          // Browser is already open
          return { success: true };

        case "wait_5_seconds":
          await this.actions.delay(5000);
          return { success: true };

        case "go_back":
          tab.goBack();
          await this.waitForLoad(tab);
          return { success: true };

        case "go_forward":
          tab.goForward();
          await this.waitForLoad(tab);
          return { success: true };

        case "search":
          await tab.loadURL("https://www.google.com");
          await this.waitForLoad(tab);
          return { success: true };

        case "navigate":
          if (!args || typeof args.url !== "string") {
            return { success: false, error: "Invalid URL provided" };
          }
          await tab.loadURL(args.url);
          await this.waitForLoad(tab);
          return { success: true };

        case "click_at":
          return await this.clickAt(tab, args.x as number, args.y as number);

        case "hover_at":
          return await this.actions.hoverAt(
            tab,
            args.x as number,
            args.y as number
          );

        case "type_text_at":
          return await this.actions.typeTextAt(
            tab,
            args.x as number,
            args.y as number,
            args.text as string,
            args.press_enter !== false,
            args.clear_before_typing !== false
          );

        case "key_combination":
          return await this.actions.keyCombo(tab, args.keys as string);

        case "scroll_document":
          return await this.actions.scrollDocument(
            tab,
            args.direction as string
          );

        case "scroll_at":
          return await this.actions.scrollAt(
            tab,
            args.x as number,
            args.y as number,
            args.direction as string,
            (args.magnitude as number) || 800
          );

        case "drag_and_drop":
          return await this.actions.dragAndDrop(
            tab,
            args.x as number,
            args.y as number,
            args.destination_x as number,
            args.destination_y as number
          );

        default:
          return {
            success: false,
            error: `Unknown action: ${name}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  public sendStatus(messageId: string, status: string): void {
    this.webContents.send("computer-use-status", {
      messageId,
      status,
    });
  }

  public sendComplete(messageId: string, result: string): void {
    this.webContents.send("computer-use-complete", {
      messageId,
      result,
    });
  }

  setWindow(window: Window): void {
    this.window = window;
  }

  private async waitForLoad(tab: Tab): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(), 5000);
      const listener = () => {
        clearTimeout(timeout);
        tab.webContents.off("did-finish-load", listener);
        resolve();
      };
      tab.webContents.once("did-finish-load", listener);
    });
  }

  private sendError(messageId: string, error: string): void {
    this.webContents.send("computer-use-error", {
      messageId,
      error,
    });
  }

  stop(): void {
    this.isRunning = false;
  }
}
