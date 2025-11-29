import { app, BrowserWindow } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import * as dotenv from "dotenv";
import { join } from "path";
import { Window } from "./Window";
import { AppMenu } from "./Menu";
import { EventManager } from "./EventManager";

// Load environment variables
dotenv.config({ path: join(__dirname, "../.env") });

let mainWindow: Window | null = null;
let eventManager: EventManager | null = null;
let menu: AppMenu | null = null;

// Enable remote debugging for Stagehand CDP connection
const cdpPort = process.env.STAGEHAND_CDP_PORT || "9222";
app.commandLine.appendSwitch("remote-debugging-port", cdpPort);

const createWindow = (): Window => {
  const window = new Window();
  menu = new AppMenu(window);
  eventManager = new EventManager(window);
  return window;
};

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.electron");

  mainWindow = createWindow();

  app.on("activate", () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  if (eventManager) {
    eventManager.cleanup();
    eventManager = null;
  }

  // Clean up agent manager
  if (mainWindow) {
    const agentManager = mainWindow.sidebar.agentManagerInstance;
    if (agentManager) {
      await agentManager.cleanup();
    }
    mainWindow = null;
  }
  if (menu) {
    menu = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
