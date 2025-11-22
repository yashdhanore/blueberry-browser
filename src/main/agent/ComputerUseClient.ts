import {
  GoogleGenAI,
  Content,
  Part,
  FunctionCall,
  Environment,
} from "@google/genai";
import {
  GeminiFunctionCall,
  AgentAction,
  AgentError,
  AgentErrorCode,
  PlanNextActionParams,
  PlanNextActionResponse,
  SendFunctionResponseParams,
} from "./ComputerUseTypes";

const DEFAULT_MODEL = "gemini-2.5-computer-use-preview-10-2025";
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000;

/**
 * Client for interacting with Gemini Computer Use
 */
export class ComputerUseClient {
  private ai: GoogleGenAI;
  private conversationHistory: Content[] = [];
  private apiKey: string;
  private modelName: string;

  constructor(apiKey?: string, modelName?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
    this.modelName = modelName || DEFAULT_MODEL;

    if (!this.apiKey) {
      throw new AgentError(
        "GEMINI_API_KEY not found in environment variables",
        AgentErrorCode.GEMINI_API_ERROR
      );
    }

    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  private bufferToBase64(buffer: Buffer): string {
    return buffer.toString("base64");
  }

  // make this better later
  private buildInitialMessage(
    screenshot: Buffer,
    currentUrl: string,
    userGoal: string,
    previousActions?: AgentAction[]
  ): Content {
    const parts: Part[] = [];

    // Add context about previous actions if any
    if (previousActions && previousActions.length > 0) {
      const actionSummary = previousActions
        .map((action, idx) => {
          const args = JSON.stringify(action.functionCall.args);
          return `${idx + 1}. ${action.functionCall.name}(${args}) - ${action.status}`;
        })
        .join("\n");

      parts.push({
        text: `Previous actions taken:\n${actionSummary}\n\n`,
      });
    }

    parts.push({
      text: `Current URL: ${currentUrl}\n\nUser Goal: ${userGoal}\n\nPlease analyze the screenshot and determine the best next action to take.`,
    });

    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: this.bufferToBase64(screenshot),
      },
    });

    return {
      role: "user",
      parts,
    };
  }

  private buildFunctionResponseMessage(
    functionName: string,
    result: any,
    newScreenshot: Buffer,
    newUrl: string,
    safetyAcknowledgement?: boolean
  ): Content {
    const parts: Part[] = [];

    // Add function response
    parts.push({
      functionResponse: {
        name: functionName,
        response: {
          ...result,
          url: newUrl,
        },
      },
    });

    if (safetyAcknowledgement) {
      parts.push({
        text: "User has approved this action. Please continue.",
      });
    }

    parts.push({
      text: `Current URL: ${newUrl}`,
    });

    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: this.bufferToBase64(newScreenshot),
      },
    });

    return {
      role: "user",
      parts,
    };
  }

  private parseModelResponse(response: any): {
    reasoning: string;
    functionCalls: GeminiFunctionCall[];
    isComplete: boolean;
    finalResponse?: string;
  } {
    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw new AgentError(
        "No candidate in response",
        AgentErrorCode.GEMINI_API_ERROR,
        { response }
      );
    }

    const content = candidate.content;
    if (!content || !content.parts) {
      throw new AgentError(
        "No content parts in response",
        AgentErrorCode.GEMINI_API_ERROR,
        { response }
      );
    }

    let reasoning = "";
    const functionCalls: GeminiFunctionCall[] = [];
    let finalResponse: string | undefined;

    for (const part of content.parts) {
      if (part.text) {
        reasoning += part.text + " ";
      }

      if (part.functionCall) {
        const fc = part.functionCall as FunctionCall;
        functionCalls.push({
          name: fc.name || "",
          args: fc.args || {},
        });
      }
    }

    reasoning = reasoning.trim();

    const isComplete = functionCalls.length === 0;
    if (isComplete) {
      finalResponse = reasoning;
    }

    return {
      reasoning,
      functionCalls,
      isComplete,
      finalResponse,
    };
  }

  /**
   * Make API call with retry logic
   */
  private async getResponse(newContent: Content): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const allContents = [...this.conversationHistory, newContent];

        const response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: allContents,
          config: {
            tools: [
              {
                computerUse: {
                  environment: Environment.ENVIRONMENT_BROWSER,
                },
              },
            ],
            // Optional: Enable thinking mode for better reasoning
            // temperature: 1.0,
            // topP: 0.95,
          },
        });

        return response;
      } catch (error: any) {
        lastError = error;

        if (error.message?.includes("rate limit") || error.status === 429) {
          const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
          console.warn(
            `Rate limited, retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw new AgentError(
          `Gemini API error: ${error.message}`,
          AgentErrorCode.GEMINI_API_ERROR,
          { originalError: error, attempt }
        );
      }
    }

    throw new AgentError(
      `Gemini API failed after ${MAX_RETRIES} retries: ${lastError?.message}`,
      AgentErrorCode.GEMINI_RATE_LIMIT,
      { originalError: lastError }
    );
  }

  /**
   * Plan the next action based on current state
   */
  async planNextAction(
    params: PlanNextActionParams
  ): Promise<PlanNextActionResponse> {
    const { screenshot, currentUrl, userGoal, previousActions } = params;

    const userMessage = this.buildInitialMessage(
      screenshot,
      currentUrl,
      userGoal,
      previousActions
    );

    const response = await this.getResponse(userMessage);

    this.conversationHistory.push(userMessage);
    if (response.candidates?.[0]?.content) {
      this.conversationHistory.push(response.candidates[0].content);
    }

    return this.parseModelResponse(response);
  }

  /**
   * Send the result of a function execution back to Gemini
   */
  async sendFunctionResponse(
    params: SendFunctionResponseParams
  ): Promise<PlanNextActionResponse> {
    const {
      functionName,
      result,
      newScreenshot,
      newUrl,
      safetyAcknowledgement,
    } = params;

    const functionResponseMessage = this.buildFunctionResponseMessage(
      functionName,
      result,
      newScreenshot,
      newUrl,
      safetyAcknowledgement
    );

    const response = await this.getResponse(functionResponseMessage);

    this.conversationHistory.push(functionResponseMessage);
    if (response.candidates?.[0]?.content) {
      this.conversationHistory.push(response.candidates[0].content);
    }

    return this.parseModelResponse(response);
  }

  resetConversation(): void {
    this.conversationHistory = [];
  }

  getConversationHistory(): Content[] {
    return [...this.conversationHistory];
  }

  getModelName(): string {
    return this.modelName;
  }
}
