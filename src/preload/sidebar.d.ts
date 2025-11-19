import { ElectronAPI } from "@electron-toolkit/preload";

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

interface ComputerUseRequest {
  prompt: string;
  messageId: string;
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

interface TabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

interface SidebarAPI {
  // Chat functionality
  sendChatMessage: (request: Partial<ChatRequest>) => Promise<void>;
  clearChat: () => Promise<void>;
  getMessages: () => Promise<any[]>;
  onChatResponse: (callback: (data: ChatResponse) => void) => void;
  onMessagesUpdated: (callback: (messages: any[]) => void) => void;
  removeChatResponseListener: () => void;
  removeMessagesUpdatedListener: () => void;

  // Page content access
  getPageContent: () => Promise<string | null>;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;

  // Tab information
  getActiveTabInfo: () => Promise<TabInfo | null>;

  // Computer Use functionality
  executeComputerUse: (request: ComputerUseRequest) => Promise<void>;
  stopComputerUse: () => Promise<void>;
  onComputerUseStatus: (callback: (data: ComputerUseStatus) => void) => void;
  onComputerUseComplete: (
    callback: (data: ComputerUseComplete) => void
  ) => void;
  onComputerUseError: (callback: (data: ComputerUseError) => void) => void;
  removeComputerUseListeners: () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    sidebarAPI: SidebarAPI;
  }
}
