import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import { ComputerUseRequest } from "../main/ComputerUseTypes";

interface ChatRequest {
  message: string;
  context: {
    url: string | null;
    content: string | null;
    text: string | null;
  };
  messageId: string;
}

interface ChatResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
}

interface ComputerUseStatus {
  messageId: string;
  status: string;
}

interface ComputerUseComplete {
  messageId: string;
  result: string;
}

interface ComputerUseError {
  messageId: string;
  error: string;
}

// Sidebar specific APIs
const sidebarAPI = {
  // Chat functionality
  sendChatMessage: (request: Partial<ChatRequest>) =>
    electronAPI.ipcRenderer.invoke("sidebar-chat-message", request),

  clearChat: () => electronAPI.ipcRenderer.invoke("sidebar-clear-chat"),

  getMessages: () => electronAPI.ipcRenderer.invoke("sidebar-get-messages"),

  onChatResponse: (callback: (data: ChatResponse) => void) => {
    electronAPI.ipcRenderer.on("chat-response", (_, data) => callback(data));
  },

  onMessagesUpdated: (callback: (messages: any[]) => void) => {
    electronAPI.ipcRenderer.on("chat-messages-updated", (_, messages) =>
      callback(messages)
    );
  },

  removeChatResponseListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-response");
  },

  removeMessagesUpdatedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-messages-updated");
  },

  // Page content access
  getPageContent: () => electronAPI.ipcRenderer.invoke("get-page-content"),
  getPageText: () => electronAPI.ipcRenderer.invoke("get-page-text"),
  getCurrentUrl: () => electronAPI.ipcRenderer.invoke("get-current-url"),

  // Tab information
  getActiveTabInfo: () => electronAPI.ipcRenderer.invoke("get-active-tab-info"),

  executeComputerUse: (request: ComputerUseRequest) =>
    electronAPI.ipcRenderer.invoke("computer-use-execute", request),

  stopComputerUse: () => electronAPI.ipcRenderer.invoke("computer-use-stop"),

  onComputerUseStatus: (callback: (data: ComputerUseStatus) => void) => {
    electronAPI.ipcRenderer.on("computer-use-status", (_, data) =>
      callback(data)
    );
  },

  onComputerUseComplete: (callback: (data: ComputerUseComplete) => void) => {
    electronAPI.ipcRenderer.on("computer-use-complete", (_, data) =>
      callback(data)
    );
  },

  onComputerUseError: (callback: (data: ComputerUseError) => void) => {
    electronAPI.ipcRenderer.on("computer-use-error", (_, data) =>
      callback(data)
    );
  },

  removeComputerUseListeners: () => {
    electronAPI.ipcRenderer.removeAllListeners("computer-use-status");
    electronAPI.ipcRenderer.removeAllListeners("computer-use-complete");
    electronAPI.ipcRenderer.removeAllListeners("computer-use-error");
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("sidebarAPI", sidebarAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.sidebarAPI = sidebarAPI;
}
