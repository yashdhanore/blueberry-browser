export const COORDINATE_RANGE = 1000;

/**
 * Possible states of the agent during task execution
 */
export enum AgentState {
  IDLE = "IDLE",
  RUNNING = "RUNNING",
  PAUSED = "PAUSED",
  WAITING_CONFIRMATION = "WAITING_CONFIRMATION",
  COMPLETED = "COMPLETED",
  ERROR = "ERROR",
}

export interface NormalizedCoordinates {
  x: number;
  y: number;
}

export interface PixelCoordinates {
  x: number;
  y: number;
}

/**
 * Status of an executed action
 */
export enum ActionStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  SKIPPED = "SKIPPED",
}

export interface AgentAction {
  id: string;
  timestamp: number;
  functionCall: {
    name: string;
    args: any;
  };
  status: ActionStatus;
  reasoning?: string;
  result?: any;
  error?: string;
  screenshot?: string;
  url?: string;
}

/**
 * Part of a message (text or image)
 */
export interface AgentMessagePart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
  function_call?: {
    name: string;
    args: any;
  };
  function_response?: {
    name: string;
    response: any;
  };
}

/**
 * A message
 */
export interface AgentMessage {
  role: "user" | "model";
  parts: AgentMessagePart[];
}

/**
 * Complete context for a task
 */
export interface TaskContext {
  id: string;
  userGoal: string;
  state: AgentState;
  actions: AgentAction[];
  currentUrl: string;
  startTime: number;
  endTime?: number;
  error?: string;
  finalResponse?: string;
  conversationHistory: AgentMessage[];
}

/**
 * Configuration for the agent
 */
export interface AgentConfig {
  geminiApiKey?: string;
  /**
   * Max number of reasoning/action turns the agent is allowed to take.
   */
  maxTurns?: number;
  screenshotQuality?: number;
  enableThinking?: boolean;
  timeout?: number;
  actionTimeout?: number;
}

/**
 * Custom error for agent system
 */
export class AgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export enum AgentErrorCode {
  GEMINI_API_ERROR = "GEMINI_API_ERROR",
  GEMINI_RATE_LIMIT = "GEMINI_RATE_LIMIT",
  INVALID_FUNCTION_CALL = "INVALID_FUNCTION_CALL",
  EXECUTION_TIMEOUT = "EXECUTION_TIMEOUT",
  ACTION_FAILED = "ACTION_FAILED",
  SAFETY_BLOCKED = "SAFETY_BLOCKED",
  NETWORK_ERROR = "NETWORK_ERROR",
  INVALID_STATE = "INVALID_STATE",
  USER_CANCELLED = "USER_CANCELLED",
}

export interface ToolResult {
  success: boolean;
  error?: string;
  data?: any;
}

export interface TypeParams {
  x: number;
  y: number;
  text: string;
  pressEnter?: boolean;
  clearFirst?: boolean;
}

export interface ScrollAtParams {
  x: number;
  y: number;
  direction: "up" | "down" | "left" | "right";
  magnitude?: number;
}
