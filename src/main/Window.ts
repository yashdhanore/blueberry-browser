import { BaseWindow, shell } from "electron";
import { Tab } from "./Tab";
import { TopBar } from "./TopBar";
import { SideBar } from "./SideBar";

export class Window {
  private _baseWindow: BaseWindow;
  private tabsMap: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private tabCounter: number = 0;
  private _topBar: TopBar;
  private _sideBar: SideBar;
  private _isAgentInteractionLocked: boolean = false;

  constructor() {
    this._baseWindow = new BaseWindow({
      width: 1288,
      height: 799,
      show: true,
      autoHideMenuBar: false,
      titleBarStyle: "hidden",
      ...(process.platform !== "darwin" ? { titleBarOverlay: true } : {}),
      trafficLightPosition: { x: 15, y: 13 },
    });

    this._baseWindow.setMinimumSize(1288, 799);

    this._topBar = new TopBar(this._baseWindow);
    this._sideBar = new SideBar(this._baseWindow);

    this._sideBar.client.setWindow(this);

    this.createTab();

    this._baseWindow.on("resize", () => {
      this.updateTabBounds();
      this._topBar.updateBounds();
      this._sideBar.updateBounds();
      const bounds = this._baseWindow.getBounds();
      if (this.activeTab) {
        this.activeTab.webContents.send("window-resized", {
          width: bounds.width,
          height: bounds.height,
        });
      }
    });

    this.tabsMap.forEach((tab) => {
      tab.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url);
        return { action: "deny" };
      });
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this._baseWindow.on("closed", () => {
      this.tabsMap.forEach((tab) => tab.destroy());
      this.tabsMap.clear();
    });
  }

  get window(): BaseWindow {
    return this._baseWindow;
  }

  get activeTab(): Tab | null {
    if (this.activeTabId) {
      return this.tabsMap.get(this.activeTabId) || null;
    }
    return null;
  }

  get allTabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  get tabCount(): number {
    return this.tabsMap.size;
  }

  createTab(url?: string): Tab {
    const tabId = `tab-${++this.tabCounter}`;
    const tab = new Tab(tabId, url);

    this._baseWindow.contentView.addChildView(tab.view);

    const contentBounds = this.getContentBounds();
    tab.view.setBounds(contentBounds);

    this.tabsMap.set(tabId, tab);

    if (this._isAgentInteractionLocked) {
      tab.setInteractionLocked(true);
    }

    if (this.tabsMap.size === 1) {
      this.switchActiveTab(tabId);
    } else {
      tab.hide();
    }

    return tab;
  }

  closeTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    this._baseWindow.contentView.removeChildView(tab.view);

    tab.destroy();

    this.tabsMap.delete(tabId);

    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      const remainingTabs = Array.from(this.tabsMap.keys());
      if (remainingTabs.length > 0) {
        this.switchActiveTab(remainingTabs[0]);
      }
    }

    if (this.tabsMap.size === 0) {
      this._baseWindow.close();
    }

    return true;
  }

  switchActiveTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    if (this.activeTabId && this.activeTabId !== tabId) {
      const currentTab = this.tabsMap.get(this.activeTabId);
      if (currentTab) {
        currentTab.hide();
      }
    }

    tab.show();
    this.activeTabId = tabId;

    tab.setInteractionLocked(this._isAgentInteractionLocked);

    this._baseWindow.setTitle(tab.title || "Blueberry Browser");

    return true;
  }

  getTab(tabId: string): Tab | null {
    return this.tabsMap.get(tabId) || null;
  }

  show(): void {
    this._baseWindow.show();
  }

  hide(): void {
    this._baseWindow.hide();
  }

  close(): void {
    this._baseWindow.close();
  }

  focus(): void {
    this._baseWindow.focus();
  }

  minimize(): void {
    this._baseWindow.minimize();
  }

  maximize(): void {
    this._baseWindow.maximize();
  }

  unmaximize(): void {
    this._baseWindow.unmaximize();
  }

  isMaximized(): boolean {
    return this._baseWindow.isMaximized();
  }

  setTitle(title: string): void {
    this._baseWindow.setTitle(title);
  }

  setBounds(bounds: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): void {
    this._baseWindow.setBounds(bounds);
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    return this._baseWindow.getBounds();
  }

  private updateTabBounds(): void {
    const contentBounds = this.getContentBounds();

    this.tabsMap.forEach((tab) => {
      tab.view.setBounds(contentBounds);
    });
  }

  updateAllBounds(): void {
    this.updateTabBounds();
    this._sideBar.updateBounds();
  }

  get sidebar(): SideBar {
    return this._sideBar;
  }

  get topBar(): TopBar {
    return this._topBar;
  }

  get tabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  get baseWindow(): BaseWindow {
    return this._baseWindow;
  }

  setAgentInteractionLocked(locked: boolean): void {
    this._isAgentInteractionLocked = locked;

    this.tabsMap.forEach((tab) => {
      tab.setInteractionLocked(locked);
    });
  }

  private getContentBounds(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const bounds = this._baseWindow.getBounds();
    const sidebarWidth = this._sideBar.getIsVisible() ? 400 : 0;

    return {
      x: 0,
      y: 88,
      width: bounds.width - sidebarWidth,
      height: bounds.height - 88,
    };
  }
}
