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

interface TabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
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

interface SidebarAPI {
  // Unified message handler
  processUserMessage: (request: {
    message: string;
    messageId: string;
  }) => Promise<ProcessMessageResult>;
  onRoutingDecision: (callback: (data: RoutingDecision) => void) => void;
  removeRoutingDecisionListener: () => void;

  // Chat functionality
  sendChatMessage: (request: ChatRequest) => Promise<void>;
  onChatResponse: (callback: (data: ChatResponse) => void) => void;
  removeChatResponseListener: () => void;
  clearChat: () => Promise<void>;
  getMessages: () => Promise<any[]>;
  onMessagesUpdated: (callback: (messages: any[]) => void) => void;
  removeMessagesUpdatedListener: () => void;

  // Page content access
  getPageContent: () => Promise<string | null>;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;

  // Tab information
  getActiveTabInfo: () => Promise<TabInfo | null>;

  // Agent functionality
  runAgentTask: (
    instruction: string
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  clearAgentHistory: () => Promise<void>;
  getAgentMessages: () => Promise<AgentMessage[]>;
  onAgentMessages: (callback: (messages: AgentMessage[]) => void) => void;
  removeAgentMessagesListener: () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    sidebarAPI: SidebarAPI;
  }
}
