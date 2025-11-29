import { ipcMain, WebContents } from "electron";
import type { Window } from "./Window";
import { AgentService } from "./agent/AgentService";

export class EventManager {
  private mainWindow: Window;
  private agentService: AgentService;

  constructor(mainWindow: Window) {
    this.mainWindow = mainWindow;
    this.agentService = AgentService.getInstance();
    this.agentService.setWindow(this.mainWindow);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.handleTabEvents();
    this.handleSidebarEvents();
    this.handlePageContentEvents();
    this.handleDarkModeEvents();
    this.handleDebugEvents();
    this.handleAgentEvents();
  }

  private handleTabEvents(): void {
    ipcMain.handle("create-tab", (_, url?: string) => {
      const newTab = this.mainWindow.createTab(url);
      return { id: newTab.id, title: newTab.title, url: newTab.url };
    });

    ipcMain.handle("close-tab", (_, id: string) => {
      this.mainWindow.closeTab(id);
    });

    ipcMain.handle("switch-tab", (_, id: string) => {
      this.mainWindow.switchActiveTab(id);
    });

    ipcMain.handle("get-tabs", () => {
      const activeTabId = this.mainWindow.activeTab?.id;
      return this.mainWindow.allTabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        isActive: activeTabId === tab.id,
      }));
    });

    ipcMain.handle("navigate-to", (_, url: string) => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.loadURL(url);
      }
    });

    ipcMain.handle("navigate-tab", async (_, tabId: string, url: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        await tab.loadURL(url);
        return true;
      }
      return false;
    });

    ipcMain.handle("go-back", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goBack();
      }
    });

    ipcMain.handle("go-forward", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goForward();
      }
    });

    ipcMain.handle("reload", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.reload();
      }
    });

    ipcMain.handle("tab-go-back", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goBack();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-go-forward", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goForward();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-reload", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.reload();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-screenshot", async (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        const image = await tab.screenshot();
        return image.toDataURL();
      }
      return null;
    });

    ipcMain.handle("tab-run-js", async (_, tabId: string, code: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        return await tab.runJs(code);
      }
      return null;
    });

    ipcMain.handle("get-active-tab-info", () => {
      const activeTab = this.mainWindow.activeTab;
      if (activeTab) {
        return {
          id: activeTab.id,
          url: activeTab.url,
          title: activeTab.title,
          canGoBack: activeTab.webContents.navigationHistory.canGoBack(),
          canGoForward: activeTab.webContents.navigationHistory.canGoForward(),
        };
      }
      return null;
    });
  }

  private handleSidebarEvents(): void {
    ipcMain.handle("toggle-sidebar", () => {
      this.mainWindow.sidebar.toggle();
      this.mainWindow.updateAllBounds();
      return true;
    });

    ipcMain.handle("sidebar-chat-message", async (_, request) => {
      await this.mainWindow.sidebar.client.sendChatMessage(request);
    });

    ipcMain.handle("sidebar-clear-chat", () => {
      this.mainWindow.sidebar.client.clearMessages();
      return true;
    });

    ipcMain.handle("sidebar-get-messages", () => {
      return this.mainWindow.sidebar.client.getMessages();
    });

    ipcMain.handle(
      "sidebar-get-smart-suggestions",
      async (_, count?: number) => {
        try {
          return await this.mainWindow.sidebar.client.generateSmartSuggestions(
            typeof count === "number" ? count : undefined
          );
        } catch (error) {
          console.warn("Failed to fetch smart suggestions:", error);
          return [];
        }
      }
    );
  }

  private handlePageContentEvents(): void {
    ipcMain.handle("get-page-content", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabHtml();
        } catch (error) {
          console.error("Error getting page content:", error);
          return null;
        }
      }
      return null;
    });

    ipcMain.handle("get-page-text", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabText();
        } catch (error) {
          console.error("Error getting page text:", error);
          return null;
        }
      }
      return null;
    });

    ipcMain.handle("get-current-url", () => {
      if (this.mainWindow.activeTab) {
        return this.mainWindow.activeTab.url;
      }
      return null;
    });
  }

  private handleDarkModeEvents(): void {
    ipcMain.on("dark-mode-changed", (event, isDarkMode) => {
      this.broadcastDarkMode(event.sender, isDarkMode);
    });
  }

  private handleDebugEvents(): void {
    ipcMain.on("ping", () => console.log("pong"));
  }

  /**
   * Agent IPC handlers
   */
  private handleAgentEvents(): void {
    ipcMain.handle("agent-start", async (_, goal: string) => {
      console.log("agent-start received:", goal);
      return await this.agentService.startAgent(goal);
    });

    ipcMain.handle("agent-cancel", async () => {
      console.log("agent-cancel received");
      await this.agentService.cancelAgent();
    });

    ipcMain.handle("agent-pause", () => {
      console.log("agent-pause received");
      this.agentService.pauseAgent();
    });

    ipcMain.handle("agent-resume", async () => {
      console.log("agent-resume received");
      await this.agentService.resumeAgent();
    });

    ipcMain.handle("agent-get-state", () => {
      return this.agentService.getAgentState();
    });
  }

  private broadcastDarkMode(sender: WebContents, isDarkMode: boolean): void {
    if (this.mainWindow.topBar.view.webContents !== sender) {
      this.mainWindow.topBar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode
      );
    }

    if (this.mainWindow.sidebar.view.webContents !== sender) {
      this.mainWindow.sidebar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode
      );
    }

    this.mainWindow.allTabs.forEach((tab) => {
      if (tab.webContents !== sender) {
        tab.webContents.send("dark-mode-updated", isDarkMode);
      }
    });
  }

  public cleanup(): void {
    ipcMain.removeAllListeners();
  }
}
