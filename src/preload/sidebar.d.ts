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

interface AgentUpdate {
  type:
    | "start"
    | "turn"
    | "action"
    | "actionComplete"
    | "reasoning"
    | "complete"
    | "error"
    | "cancelled";
  data: any;
}

interface AgentState {
  isRunning: boolean;
  isPaused: boolean;
  goal: string | null;
  currentTurn: number;
  maxTurns: number;
  actions: Array<{
    id: string;
    type: string;
    args: any;
    status: "pending" | "completed" | "failed";
    timestamp: number;
  }>;
  error: string | null;
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
  getSmartSuggestions: (count?: number) => Promise<string[]>;

  // Tab information
  getActiveTabInfo: () => Promise<TabInfo | null>;

  // Agent
  startAgent: (goal: string) => Promise<{ success: boolean; error?: string }>;
  cancelAgent: () => Promise<void>;
  pauseAgent: () => Promise<void>;
  resumeAgent: () => Promise<void>;
  getAgentState: () => Promise<AgentState | null>;
  onAgentUpdate: (callback: (data: AgentUpdate) => void) => void;
  removeAgentUpdateListener: () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    sidebarAPI: SidebarAPI;
  }
}
