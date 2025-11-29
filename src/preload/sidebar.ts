import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

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

interface RoutingDecision {
  messageId: string;
  mode: "chat" | "agent";
  reason: string;
  error?: string;
}

interface ProcessMessageResult {
  mode: "chat" | "agent";
  success: boolean;
  message?: string;
  error?: string;
  reason: string;
}

// Sidebar specific APIs
const sidebarAPI = {
  // Unified message handler - automatically routes to chat or agent
  processUserMessage: (request: { message: string; messageId: string }) =>
    electronAPI.ipcRenderer.invoke(
      "sidebar-handle-user-message",
      request
    ) as Promise<ProcessMessageResult>,

  onRoutingDecision: (callback: (data: RoutingDecision) => void) => {
    electronAPI.ipcRenderer.on("sidebar-routing-decision", (_, data) =>
      callback(data)
    );
  },

  removeRoutingDecisionListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("sidebar-routing-decision");
  },

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

  // Agent functionality
  runAgentTask: (instruction: string) =>
    electronAPI.ipcRenderer.invoke("sidebar-agent-run", instruction),

  clearAgentHistory: () =>
    electronAPI.ipcRenderer.invoke("sidebar-agent-clear"),

  getAgentMessages: () =>
    electronAPI.ipcRenderer.invoke("sidebar-agent-get-messages"),

  onAgentMessages: (callback: (messages: any[]) => void) => {
    electronAPI.ipcRenderer.on("sidebar-agent-messages", (_, messages) =>
      callback(messages)
    );
  },

  removeAgentMessagesListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("sidebar-agent-messages");
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
