import { Stagehand } from "@browserbasehq/stagehand";
import type { Window } from "../Window";

/**
 * Centralized lifecycle manager for the shared Stagehand instance.
 *
 * - Initializes Stagehand in LOCAL mode against Electron's CDP endpoint.
 * - Provides helpers to resolve the correct Stagehand page for the active tab.
 * - Handles best-effort cleanup on app shutdown.
 */
export class StagehandService {
  private static instance: StagehandService | null = null;

  private stagehand: Stagehand | null = null;
  private initPromise: Promise<Stagehand> | null = null;

  static getInstance(): StagehandService {
    if (!StagehandService.instance) {
      StagehandService.instance = new StagehandService();
    }
    return StagehandService.instance;
  }

  private constructor() {}

  /**
   * Get (or lazily initialize) the shared Stagehand instance.
   */
  async getStagehand(): Promise<Stagehand> {
    if (this.stagehand) {
      return this.stagehand;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.createStagehand();

    try {
      this.stagehand = await this.initPromise;
      return this.stagehand;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Resolve the underlying v3 context, if Stagehand has been initialized.
   */
  getContext(): any | null {
    if (!this.stagehand) return null;
    return (this.stagehand as any).context ?? null;
  }

  /**
   * Resolve the best Stagehand page corresponding to the active tab
   * in the given Electron window.
   */
  async getPageForActiveTab(window: Window): Promise<any> {
    const stagehand = await this.getStagehand();
    const ctx = (stagehand as any).context;
    if (!ctx) {
      throw new Error("Stagehand context not available");
    }

    const pages = ctx.pages() as any[];
    const activeTab = window.activeTab;

    const isAuxiliaryUrl = (url: string | undefined | null) => {
      if (!url) return true;
      const lower = url.toLowerCase();
      if (lower.startsWith("chrome://") || lower.startsWith("devtools://"))
        return true;
      if (lower.includes("localhost:5173/topbar")) return true;
      if (lower.includes("localhost:5173/sidebar")) return true;
      return false;
    };

    // 1) Prefer the page whose URL matches the active tab's URL
    if (activeTab) {
      const tabUrl = activeTab.url;
      const matchByUrl = pages.find((p) => {
        try {
          return p.url() === tabUrl;
        } catch {
          return false;
        }
      });
      if (matchByUrl) {
        return matchByUrl;
      }
    }

    // 2) Fallback to the last non-auxiliary page, preferring the active one
    const nonAuxPages = pages.filter((p) => {
      try {
        return !isAuxiliaryUrl(p.url());
      } catch {
        return false;
      }
    });

    if (nonAuxPages.length > 0) {
      const active = ctx.activePage?.();
      if (active && nonAuxPages.includes(active)) {
        return active;
      }
      return nonAuxPages[nonAuxPages.length - 1];
    }

    // 3) Last resort: any active page that is not clearly auxiliary
    const active = ctx.activePage?.();
    if (active && !isAuxiliaryUrl(active.url())) {
      return active;
    }

    throw new Error("No suitable Stagehand page found for active tab");
  }

  /**
   * Best-effort shutdown of the shared Stagehand instance.
   * Safe to call multiple times.
   */
  async shutdown(opts?: { force?: boolean }): Promise<void> {
    if (!this.stagehand) return;

    try {
      console.log("[StagehandService] Closing Stagehand session...");
      await this.stagehand.close(opts);
      console.log("[StagehandService] Stagehand session closed.");
    } catch (err) {
      console.warn(
        "[StagehandService] Error while closing Stagehand session:",
        err
      );
    } finally {
      this.stagehand = null;
    }
  }

  private async createStagehand(): Promise<Stagehand> {
    const cdpUrl = await this.resolveCdpUrl();
    console.log(
      "[StagehandService] Initializing Stagehand connected to Electron...",
      cdpUrl
    );

    const stagehand = new Stagehand({
      env: "LOCAL",
      experimental: true,
      disableAPI: true,
      localBrowserLaunchOptions: {
        cdpUrl,
      },
    });

    await stagehand.init();
    console.log("[StagehandService] Stagehand initialized.");

    return stagehand;
  }

  /**
   * Resolve the CDP WebSocket URL for the local Electron instance.
   */
  private async resolveCdpUrl(): Promise<string> {
    const base =
      process.env.ELECTRON_REMOTE_DEBUGGING_URL || "http://127.0.0.1:9222";
    const versionUrl = `${base.replace(/\/$/, "")}/json/version`;

    try {
      const res = await fetch(versionUrl);
      if (!res.ok) {
        throw new Error(`CDP endpoint returned ${res.status}`);
      }
      const data = (await res.json()) as { webSocketDebuggerUrl?: string };
      if (data?.webSocketDebuggerUrl) {
        return data.webSocketDebuggerUrl;
      }
      return base;
    } catch (err) {
      console.warn(
        `[StagehandService] Failed to resolve CDP ws endpoint from ${versionUrl}. Falling back to ${base}:`,
        err
      );
      return base;
    }
  }
}
