import { NativeImage, WebContentsView } from "electron";

export class Tab {
  private webContentsView: WebContentsView;
  private _id: string;
  private _title: string;
  private _url: string;
  private _isVisible: boolean = false;
  private _isInteractionLocked: boolean = false;

  constructor(id: string, url: string = "https://www.google.com") {
    this._id = id;
    this._url = url;
    this._title = "New Tab";

    this.webContentsView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });

    this.setupEventListeners();

    this.loadURL(url);
  }

  private setupEventListeners(): void {
    this.webContentsView.webContents.on("page-title-updated", (_, title) => {
      this._title = title;
    });

    this.webContentsView.webContents.on("did-navigate", (_, url) => {
      this._url = url;
      if (this._isInteractionLocked) {
        void this.updateControlBanner();
      }
    });

    this.webContentsView.webContents.on("did-navigate-in-page", (_, url) => {
      this._url = url;
      if (this._isInteractionLocked) {
        void this.updateControlBanner();
      }
    });
  }

  get id(): string {
    return this._id;
  }

  get title(): string {
    return this._title;
  }

  get url(): string {
    return this._url;
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  get isInteractionLocked(): boolean {
    return this._isInteractionLocked;
  }

  get webContents() {
    return this.webContentsView.webContents;
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }

  show(): void {
    this._isVisible = true;
    this.webContentsView.setVisible(true);
  }

  hide(): void {
    this._isVisible = false;
    this.webContentsView.setVisible(false);
  }

  setInteractionLocked(locked: boolean): void {
    this._isInteractionLocked = locked;
    void this.updateControlBanner();
  }

  async screenshot(): Promise<NativeImage> {
    return await this.webContentsView.webContents.capturePage();
  }

  async runJs(code: string): Promise<any> {
    return await this.webContentsView.webContents.executeJavaScript(code);
  }

  async getTabHtml(): Promise<string> {
    return await this.runJs("return document.documentElement.outerHTML");
  }

  async getTabText(): Promise<string> {
    return await this.runJs("return document.documentElement.innerText");
  }

  loadURL(url: string): Promise<void> {
    this._url = url;
    return this.webContentsView.webContents.loadURL(url);
  }

  goBack(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoBack()) {
      this.webContentsView.webContents.navigationHistory.goBack();
    }
  }

  goForward(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoForward()) {
      this.webContentsView.webContents.navigationHistory.goForward();
    }
  }

  reload(): void {
    this.webContentsView.webContents.reload();
  }

  stop(): void {
    this.webContentsView.webContents.stop();
  }

  destroy(): void {
    this.webContentsView.webContents.close();
  }

  private async updateControlBanner(): Promise<void> {
    try {
      if (this._isInteractionLocked) {
        await this.runJs(`
          (function () {
            const existing = document.getElementById("__blueberry_agent_banner__");
            if (existing) return;

            const banner = document.createElement("div");
            banner.id = "__blueberry_agent_banner__";
            Object.assign(banner.style, {
              position: "fixed",
              bottom: "24px",
              left: "50%",
              transform: "translateX(-50%)",
              padding: "8px 18px",
              borderRadius: "999px",
              background: "rgba(0, 0, 0, 0.8)",
              color: "#f2f6ff",
              fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
              fontSize: "13px",
              letterSpacing: "0.3px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              border: "1px solid rgba(122, 162, 255, 0.6)",
              zIndex: 2147483647,
              pointerEvents: "none"
            });
            banner.textContent = "Controlled by Blueberry";

            (document.body || document.documentElement).appendChild(banner);
          })();
        `);
      } else {
        await this.runJs(`
          (function () {
            const banner = document.getElementById("__blueberry_agent_banner__");
            if (banner) {
              banner.remove();
            }
          })();
        `);
      }
    } catch {
      // Ignore banner failures
    }
  }
}
