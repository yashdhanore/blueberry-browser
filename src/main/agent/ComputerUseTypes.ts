export const COORDINATE_RANGE = 999;

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
 * Base interface for all Gemini function call arguments
 */
export interface GeminiBaseFunctionArgs {
  safety_decision?: SafetyDecision;
}

/**
 * for navigate function
 */
export interface NavigateArgs extends GeminiBaseFunctionArgs {
  url: string;
}

/**
 * for click_at function
 */
export interface ClickAtArgs extends GeminiBaseFunctionArgs {
  x: number;
  y: number;
}

/**
 * for type_text_at function
 */
export interface TypeTextAtArgs extends GeminiBaseFunctionArgs {
  x: number;
  y: number;
  text: string;
}

/**
 * Arguments for scroll_document function, positive = down and negative = up
 */
export interface ScrollDocumentArgs extends GeminiBaseFunctionArgs {
  scroll_amount: number;
}

/**
 * Arguments for scroll_at function
 */
export interface ScrollAtArgs extends GeminiBaseFunctionArgs {
  x: number;
  y: number;
  scroll_amount: number;
}

/**
 * Arguments for hover_at function
 */
export interface HoverAtArgs extends GeminiBaseFunctionArgs {
  x: number;
  y: number;
}

/**
 * Arguments for key_combination function
 */
export interface KeyCombinationArgs extends GeminiBaseFunctionArgs {
  keys: string[]; // example ["Cmd", "c"]
}

export type GeminiFunctionArgs =
  | NavigateArgs
  | ClickAtArgs
  | TypeTextAtArgs
  | ScrollDocumentArgs
  | ScrollAtArgs
  | HoverAtArgs
  | KeyCombinationArgs
  | GeminiBaseFunctionArgs;

export interface GeminiFunctionCall {
  name: string;
  args: GeminiFunctionArgs;
}

export interface SafetyDecision {
  decision: "ALLOWED" | "REQUIRES_CONFIRMATION" | "BLOCKED";
  reasoning?: string;
  risk_level?: "LOW" | "MEDIUM" | "HIGH";
}

/**
 * User's response to a safety confirmation request
 */
export interface SafetyConfirmationResponse {
  approved: boolean;
  remember?: boolean;
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

/**
 * Represents one action the agent has taken or will take
 */
export interface AgentAction {
  id: string;
  timestamp: number;
  functionCall: GeminiFunctionCall;
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
  function_call?: GeminiFunctionCall;
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
 * Types of events sent to the UI
 */
export enum AgentEventType {
  TASK_STARTED = "TASK_STARTED",
  TASK_COMPLETED = "TASK_COMPLETED",
  TASK_FAILED = "TASK_FAILED",
  STATE_CHANGED = "STATE_CHANGED",
  ACTION_STARTED = "ACTION_STARTED",
  ACTION_COMPLETED = "ACTION_COMPLETED",
  ACTION_FAILED = "ACTION_FAILED",
  REASONING_UPDATE = "REASONING_UPDATE",
  SCREENSHOT_UPDATE = "SCREENSHOT_UPDATE",
  SAFETY_CONFIRMATION_NEEDED = "SAFETY_CONFIRMATION_NEEDED",
  PROGRESS_UPDATE = "PROGRESS_UPDATE",
}

/**
 * Event payload to UI
 */
export interface AgentUIUpdate {
  type: AgentEventType;
  taskId: string;
  timestamp: number;
  data?: {
    state?: AgentState;
    action?: AgentAction;
    reasoning?: string;
    screenshot?: string; // Base64
    url?: string;
    error?: string;
    finalResponse?: string;
    safetyDecision?: SafetyDecision;
    currentStep?: number;
    totalSteps?: number;
  };
}

/**
 * Result from executing an MCP tool
 */
export interface MCPToolResult {
  success: boolean;
  data?: any;
  error?: string;
  screenshot?: Buffer;
  url?: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  elements: PageElement[];
  timestamp: number;
}

/**
 * Simplified page element for context
 */
export interface PageElement {
  type: string;
  role?: string; // ARIA role
  text?: string; // Visible text
  value?: string; // Input value
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes?: Record<string, string>;
}

/**
 * Configuration for the agent
 */
export interface AgentConfig {
  geminiApiKey: string;
  model?: string; // Default: gemini-2.5-computer-use-preview-10-2025
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
