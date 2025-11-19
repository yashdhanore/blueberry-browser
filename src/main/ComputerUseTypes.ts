export interface ComputerUseRequest {
  prompt: string;
  messageId: string;
}

export interface FunctionCall {
  name: string;
  args: Record<string, any>;
}

export interface SafetyDecision {
  decision: "regular" | "require_confirmation" | "block";
  explanation?: string;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}
