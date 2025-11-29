import { Stagehand } from "@browserbasehq/stagehand";
import { WebContents } from "electron";
import * as dotenv from "dotenv";
import { join } from "path";
import type { Window } from "../Window";

// Load environment variables
dotenv.config({ path: join(__dirname, "../../../.env") });

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AgentTaskResult {
  success: boolean;
  message?: string;
  error?: string;
}

export class StagehandAgentManager {
  private stagehand: Stagehand | null = null;
  private isInitialized: boolean = false;
  private isRunning: boolean = false;
  private history: AgentMessage[] = [];
  private webContents: WebContents | null = null;
  private window: Window | null = null;
  private cdpPort: number;

  constructor(webContents: WebContents, window: Window) {
    this.webContents = webContents;
    this.window = window;
    this.cdpPort = parseInt(process.env.STAGEHAND_CDP_PORT || "9222", 10);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const googleApiKey = process.env.GOOGLE_API_KEY;
    if (!googleApiKey) {
      console.error(
        "❌ Stagehand Agent initialization failed: GOOGLE_API_KEY not found in environment variables."
      );
      return;
    }

    try {
      // Get CDP WebSocket URL from the Electron browser
      const cdpUrl = await this.getCdpWebSocketUrl();
      if (!cdpUrl) {
        console.error(
          "❌ Failed to get CDP WebSocket URL. Make sure remote debugging is enabled."
        );
        return;
      }

      const verbose = parseInt(process.env.STAGEHAND_VERBOSE || "1", 10);

      this.stagehand = new Stagehand({
        env: "LOCAL",
        verbose: verbose as 0 | 1 | 2,
        localBrowserLaunchOptions: {
          cdpUrl: cdpUrl,
          viewport: {
            width: 1280,
            height: 720,
          },
        },
      });

      await this.stagehand.init();
      this.isInitialized = true;
      console.log("✅ Stagehand Agent initialized successfully!");
    } catch (error) {
      console.error("❌ Error initializing Stagehand Agent:", error);
      this.isInitialized = false;
    }
  }

  private async getCdpWebSocketUrl(): Promise<string | null> {
    try {
      // Fetch the CDP endpoint to get WebSocket URL
      const response = await fetch(
        `http://127.0.0.1:${this.cdpPort}/json/version`
      );
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      // The webSocketDebuggerUrl should be available, or we construct it
      // For Electron, the CDP endpoint is typically at ws://127.0.0.1:PORT/browser
      if (data.webSocketDebuggerUrl) {
        return data.webSocketDebuggerUrl;
      }
      // Fallback: construct the WebSocket URL
      return `ws://127.0.0.1:${this.cdpPort}/browser`;
    } catch (error) {
      console.error("Error fetching CDP URL:", error);
      // Return a fallback URL - Stagehand should handle connection errors gracefully
      return `ws://127.0.0.1:${this.cdpPort}/browser`;
    }
  }

  /**
   * Inspect CDP targets to understand available pages
   * Useful for debugging - can be called to see all available CDP targets
   */
  private async inspectCdpTargets(): Promise<any[]> {
    try {
      const response = await fetch(
        `http://127.0.0.1:${this.cdpPort}/json/list`
      );
      if (!response.ok) {
        return [];
      }
      const targets = await response.json();
      return targets || [];
    } catch (error) {
      console.warn("Failed to inspect CDP targets:", error);
      return [];
    }
  }

  // Note: inspectCdpTargets() is available for debugging but not currently used
  // It can be called to inspect available CDP targets if needed

  /**
   * Check if a URL is a local UI URL (topbar, sidebar, etc.)
   */
  private isLocalUIUrl(url: string): boolean {
    if (!url) return true;
    // Check for local UI paths
    return (
      url.includes("/topbar/") ||
      url.includes("/sidebar/") ||
      url.includes("topbar.html") ||
      url.includes("sidebar.html") ||
      url.startsWith("file://") ||
      url === "about:blank"
    );
  }

  /**
   * Find the correct page that matches the active tab
   * Filters out sidebar/topbar pages and matches by URL
   */
  private async findCorrectPage(targetUrl: string): Promise<any> {
    if (!this.stagehand) {
      return null;
    }

    const pages = this.stagehand.context.pages();
    const verbose = parseInt(process.env.STAGEHAND_VERBOSE || "1", 10);

    if (verbose >= 1) {
      console.log(`[Stagehand] Found ${pages.length} page(s) in context`);
      pages.forEach((page, index) => {
        console.log(`[Stagehand] Page ${index}: ${page.url()}`);
      });
      console.log(`[Stagehand] Target URL: ${targetUrl}`);
    }

    // First, try to find a page that matches the target URL exactly
    for (const page of pages) {
      const pageUrl = page.url();
      if (pageUrl === targetUrl && !this.isLocalUIUrl(pageUrl)) {
        if (verbose >= 1) {
          console.log(`[Stagehand] Found matching page: ${pageUrl}`);
        }
        return page;
      }
    }

    // Second, try to find a page that matches the domain (for cases where URLs differ slightly)
    try {
      const targetDomain = new URL(targetUrl).hostname;
      for (const page of pages) {
        const pageUrl = page.url();
        if (!this.isLocalUIUrl(pageUrl)) {
          try {
            const pageDomain = new URL(pageUrl).hostname;
            if (pageDomain === targetDomain) {
              if (verbose >= 1) {
                console.log(
                  `[Stagehand] Found page with matching domain: ${pageUrl}`
                );
              }
              return page;
            }
          } catch {
            // Invalid URL, skip
          }
        }
      }
    } catch {
      // Target URL might be invalid, continue
    }

    // Third, filter out local UI pages and return the first external page
    const externalPages = pages.filter(
      (page) => !this.isLocalUIUrl(page.url())
    );
    if (externalPages.length > 0) {
      if (verbose >= 1) {
        console.log(
          `[Stagehand] Using first external page: ${externalPages[0].url()}`
        );
      }
      return externalPages[0];
    }

    // If no suitable page found, return null to create a new one
    if (verbose >= 1) {
      console.log("[Stagehand] No suitable page found, will create a new page");
    }
    return null;
  }

  async runTask(instruction: string): Promise<AgentTaskResult> {
    if (this.isRunning) {
      return {
        success: false,
        error:
          "Agent is already running a task. Please wait for it to complete.",
      };
    }

    if (!this.isInitialized || !this.stagehand) {
      await this.initialize();
      if (!this.isInitialized || !this.stagehand) {
        return {
          success: false,
          error:
            "Agent not initialized. Please check GOOGLE_API_KEY in your .env file.",
        };
      }
    }

    this.isRunning = true;

    // Add user message to history
    const userMessage: AgentMessage = {
      id: Date.now().toString(),
      role: "user",
      content: instruction,
      timestamp: Date.now(),
    };
    this.history.push(userMessage);
    this.broadcastHistory();

    try {
      const googleApiKey = process.env.GOOGLE_API_KEY;
      if (!googleApiKey) {
        throw new Error("GOOGLE_API_KEY not found");
      }

      const modelName =
        process.env.STAGEHAND_AGENT_MODEL ||
        "google/gemini-2.5-computer-use-preview-10-2025";

      // Get the active tab's page
      const activeTab = this.window?.activeTab;
      if (!activeTab) {
        throw new Error("No active tab found");
      }

      const currentUrl = activeTab.url;
      const verbose = parseInt(process.env.STAGEHAND_VERBOSE || "1", 10);

      if (verbose >= 1) {
        console.log(
          `[Stagehand] Looking for page matching active tab URL: ${currentUrl}`
        );
      }

      // Find the correct page that matches the active tab
      // This filters out sidebar/topbar pages
      let page = await this.findCorrectPage(currentUrl);

      // If no suitable page found, create a new one
      if (!page) {
        if (verbose >= 1) {
          console.log("[Stagehand] Creating new page for agent task");
        }
        page = await this.stagehand.context.newPage();
      }

      // Ensure the page is brought to front (activated)
      try {
        await page.bringToFront();
      } catch (error) {
        if (verbose >= 1) {
          console.warn("[Stagehand] Could not bring page to front:", error);
        }
      }

      // Navigate to current tab URL if needed
      if (
        currentUrl &&
        currentUrl !== "about:blank" &&
        currentUrl !== page.url()
      ) {
        if (verbose >= 1) {
          console.log(
            `[Stagehand] Navigating page from ${page.url()} to ${currentUrl}`
          );
        }
        try {
          await page.goto(currentUrl, {
            waitUntil: "domcontentloaded",
          });
          if (verbose >= 1) {
            console.log(`[Stagehand] Successfully navigated to ${currentUrl}`);
          }
        } catch (error) {
          console.warn(
            "[Stagehand] Failed to navigate Stagehand page to current URL:",
            error
          );
          // Continue anyway - the agent can work with whatever page is open
        }
      } else if (verbose >= 1) {
        console.log(`[Stagehand] Page already at target URL: ${page.url()}`);
      }

      // Create agent with computer use capabilities
      const agent = this.stagehand.agent({
        cua: true,
        model: {
          modelName: modelName,
          apiKey: googleApiKey,
        },
        systemPrompt: `You are a helpful assistant that can use a web browser.
You are currently on the following page: ${page.url()}.
Do not ask follow up questions, the user will trust your judgement. If you are getting blocked on google, try another search engine.`,
      });

      if (verbose >= 1) {
        console.log(
          `[Stagehand] Executing agent instruction on page: ${page.url()}`
        );
        console.log(`[Stagehand] Instruction: ${instruction}`);
      }

      // Execute the agent task on the selected page
      const result = await agent.execute({
        instruction: instruction,
        maxSteps: 30,
        highlightCursor: true,
        page: page, // Explicitly specify the page to use
      });

      if (verbose >= 1) {
        console.log(
          `[Stagehand] Agent task completed: ${result.success ? "SUCCESS" : "FAILED"}`
        );
        if (result.message) {
          console.log(`[Stagehand] Result message: ${result.message}`);
        }
      }

      const assistantMessage: AgentMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.success
          ? `Task completed successfully! ${result.message || ""}`
          : `Task failed or was incomplete: ${result.message || "Unknown error"}`,
        timestamp: Date.now(),
      };

      this.history.push(assistantMessage);
      this.broadcastHistory();

      return {
        success: result.success === true,
        message: result.message || assistantMessage.content,
      };
    } catch (error) {
      console.error("Error executing agent task:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      const assistantMessage: AgentMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${errorMessage}`,
        timestamp: Date.now(),
      };

      this.history.push(assistantMessage);
      this.broadcastHistory();

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      this.isRunning = false;
    }
  }

  clearHistory(): void {
    this.history = [];
    this.broadcastHistory();
  }

  getHistory(): AgentMessage[] {
    return [...this.history];
  }

  private broadcastHistory(): void {
    if (this.webContents) {
      this.webContents.send("sidebar-agent-messages", this.history);
    }
  }

  async cleanup(): Promise<void> {
    if (this.stagehand) {
      try {
        await this.stagehand.close();
        console.log("Stagehand Agent cleaned up successfully");
      } catch (error) {
        console.error("Error cleaning up Stagehand Agent:", error);
      }
    }
    this.isInitialized = false;
    this.stagehand = null;
  }
}
