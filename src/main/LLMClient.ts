import { WebContents } from "electron";
import { streamText, type LanguageModel, type CoreMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import * as dotenv from "dotenv";
import { join } from "path";
import type { Window } from "./Window";
import { AgentService } from "./agent/AgentService";

// Load environment variables from .env file
dotenv.config({ path: join(__dirname, "../../.env") });

interface ChatRequest {
  message: string;
  messageId: string;
}

interface StreamChunk {
  content: string;
  isComplete: boolean;
}

interface PageContext {
  pageUrl: string | null;
  pageText: string | null;
}

interface IntentClassification {
  mode: "chat" | "agent";
  confidence: number;
  reason: string;
}

type LLMProvider = "openai" | "anthropic";

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-20241022",
};

const MAX_CONTEXT_LENGTH = 4000;
const DEFAULT_TEMPERATURE = 0.7;
const AGENT_TRIGGER_CONFIDENCE = 0.55;

export class LLMClient {
  private readonly webContents: WebContents;
  private window: Window | null = null;
  private readonly provider: LLMProvider;
  private readonly modelName: string;
  private readonly model: LanguageModel | null;
  private messages: CoreMessage[] = [];
  private readonly agentService: AgentService;

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    this.provider = this.getProvider();
    this.modelName = this.getModelName();
    this.model = this.initializeModel();
    this.agentService = AgentService.getInstance();

    this.logInitializationStatus();

    this.agentService.on("complete", (data) => this.handleAgentComplete(data));
    this.agentService.on("agent-error", (data) => this.handleAgentError(data));
    this.agentService.on("cancelled", () => this.handleAgentCancelled());
  }

  // Set the window reference after construction to avoid circular dependencies
  setWindow(window: Window): void {
    this.window = window;
  }

  private getProvider(): LLMProvider {
    const provider = process.env.LLM_PROVIDER?.toLowerCase();
    if (provider === "anthropic") return "anthropic";
    return "openai"; // Default to OpenAI
  }

  private getModelName(): string {
    return process.env.LLM_MODEL || DEFAULT_MODELS[this.provider];
  }

  private initializeModel(): LanguageModel | null {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    switch (this.provider) {
      case "anthropic":
        return anthropic(this.modelName);
      case "openai":
        return openai(this.modelName);
      default:
        return null;
    }
  }

  private getApiKey(): string | undefined {
    switch (this.provider) {
      case "anthropic":
        return process.env.ANTHROPIC_API_KEY;
      case "openai":
        return process.env.OPENAI_API_KEY;
      default:
        return undefined;
    }
  }

  private logInitializationStatus(): void {
    if (this.model) {
      console.log(
        `✅ LLM Client initialized with ${this.provider} provider using model: ${this.modelName}`
      );
    } else {
      const keyName =
        this.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
      console.error(
        `❌ LLM Client initialization failed: ${keyName} not found in environment variables.\n` +
          `Please add your API key to the .env file in the project root.`
      );
    }
  }

  async sendChatMessage(request: ChatRequest): Promise<void> {
    try {
      // Get screenshot from active tab if available
      let screenshot: string | null = null;
      if (this.window) {
        const activeTab = this.window.activeTab;
        if (activeTab) {
          try {
            const image = await activeTab.screenshot();
            screenshot = image.toDataURL();
          } catch (error) {
            console.error("Failed to capture screenshot:", error);
          }
        }
      }

      // Build user message content with screenshot first, then text
      const userContent: any[] = [];

      // Add screenshot as the first part if available
      if (screenshot) {
        userContent.push({
          type: "image",
          image: screenshot,
        });
      }

      // Add text content
      userContent.push({
        type: "text",
        text: request.message,
      });

      // Create user message in CoreMessage format
      const userMessage: CoreMessage = {
        role: "user",
        content: userContent.length === 1 ? request.message : userContent,
      };

      this.messages.push(userMessage);

      // Send updated messages to renderer
      this.sendMessagesToRenderer();

      const pageContext = await this.collectPageContext();
      const intent = await this.classifyIntent(request.message, pageContext);

      if (this.shouldRouteToAgent(intent)) {
        await this.handleAgentRouting(request, intent);
        return;
      }

      if (!this.model) {
        this.sendErrorMessage(
          request.messageId,
          "LLM service is not configured. Please add your API key to the .env file."
        );
        return;
      }

      const messages = await this.prepareMessagesWithContext(request, pageContext);
      await this.streamResponse(messages, request.messageId);
    } catch (error) {
      console.error("Error in LLM request:", error);
      this.handleStreamError(error, request.messageId);
    }
  }

  clearMessages(): void {
    this.messages = [];
    this.sendMessagesToRenderer();
  }

  getMessages(): CoreMessage[] {
    return this.messages;
  }

  private shouldRouteToAgent(intent: IntentClassification): boolean {
    return intent.mode === "agent" && intent.confidence >= AGENT_TRIGGER_CONFIDENCE;
  }

  private async handleAgentRouting(
    request: ChatRequest,
    intent: IntentClassification
  ): Promise<void> {
    const acknowledgement =
      "I'll take over the browser to handle that task and report back once it's done.";

    const assistantMessage: CoreMessage = {
      role: "assistant",
      content: intent.reason
        ? `${acknowledgement}\n\n_${intent.reason}_`
        : acknowledgement,
    };

    this.messages.push(assistantMessage);
    this.sendMessagesToRenderer();

    const result = await this.agentService.startAgent(request.message);
    if (!result.success) {
      const failureMessage = `I couldn't start the agent: ${
        result.error || "unknown error"
      }.`;
      this.messages.push({
        role: "assistant",
        content: failureMessage,
      });
      this.sendMessagesToRenderer();
    }

    this.sendStreamChunk(request.messageId, {
      content: acknowledgement,
      isComplete: true,
    });
  }

  private async classifyIntent(
    message: string,
    pageContext: PageContext
  ): Promise<IntentClassification> {
    if (!this.model) {
      return { mode: "chat", confidence: 0, reason: "LLM unavailable" };
    }

    const systemPrompt =
      "You are a routing classifier for a browser assistant. " +
      "Decide whether the assistant should stay in CHAT mode (pure conversation) or AGENT mode (take control of the browser). " +
      'Respond with valid JSON: {"mode":"chat|agent","confidence":0-1,"reason":"short explanation"}. ' +
      "Agent mode is required for actions like navigating, clicking, filling forms, uploading, downloading, or anything needing direct browser control. " +
      "Chat mode is for answering questions, summarizing content, or reasoning without taking control.";

    const userPromptParts = [`User message:\n${message}`];
    if (pageContext.pageUrl) {
      userPromptParts.push(`Currently viewed URL: ${pageContext.pageUrl}`);
    }

    const result = await streamText({
      model: this.model,
      temperature: 0,
      maxRetries: 2,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userPromptParts.join("\n\n"),
        },
      ],
    });

    let raw = "";
    for await (const chunk of result.textStream) {
      raw += chunk;
    }

    return this.parseIntentClassification(raw);
  }

  private parseIntentClassification(text: string): IntentClassification {
    try {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        const jsonText = text.slice(start, end + 1);
        const parsed = JSON.parse(jsonText);
        const mode = parsed.mode === "agent" ? "agent" : "chat";
        const confidence =
          typeof parsed.confidence === "number" ? parsed.confidence : 0;
        const reason =
          typeof parsed.reason === "string" ? parsed.reason : "Routing by default.";
        return { mode, confidence, reason };
      }
    } catch (error) {
      console.warn("Failed to parse intent classification response:", error);
    }
    return { mode: "chat", confidence: 0, reason: "Failed to classify" };
  }

  private async collectPageContext(): Promise<PageContext> {
    let pageUrl: string | null = null;
    let pageText: string | null = null;

    if (this.window) {
      const activeTab = this.window.activeTab;
      if (activeTab) {
        pageUrl = activeTab.url;
        try {
          pageText = await activeTab.getTabText();
        } catch (error) {
          console.error("Failed to get page text:", error);
        }
      }
    }

    return { pageUrl, pageText };
  }

  private handleAgentComplete(data: { finalResponse?: string; duration?: number }): void {
    const durationSeconds =
      typeof data?.duration === "number"
        ? ` in ${Math.round(data.duration / 1000)}s`
        : "";
    const summary =
      data?.finalResponse ||
      "The autonomous agent finished the requested task.";
    this.appendAssistantMessage(`Agent task completed${durationSeconds}: ${summary}`);
  }

  private handleAgentError(data: { error?: string }): void {
    const errorMessage = data?.error || "Unknown error";
    this.appendAssistantMessage(
      `Agent task encountered an error: ${errorMessage}.`
    );
  }

  private handleAgentCancelled(): void {
    this.appendAssistantMessage("Agent task was cancelled.");
  }

  private appendAssistantMessage(content: string): void {
    this.messages.push({
      role: "assistant",
      content,
    });
    this.sendMessagesToRenderer();
  }

  private sendMessagesToRenderer(): void {
    this.webContents.send("chat-messages-updated", this.messages);
  }

  private async prepareMessagesWithContext(
    _request: ChatRequest,
    pageContext: PageContext
  ): Promise<CoreMessage[]> {
    const { pageUrl, pageText } = pageContext;

    const systemMessage: CoreMessage = {
      role: "system",
      content: this.buildSystemPrompt(pageUrl, pageText),
    };

    return [systemMessage, ...this.messages];
  }

  private buildSystemPrompt(
    url: string | null,
    pageText: string | null
  ): string {
    const parts: string[] = [
      "You are a helpful AI assistant integrated into a web browser.",
      "You can analyze and discuss web pages with the user.",
      "The user's messages may include screenshots of the current page as the first image.",
    ];

    if (url) {
      parts.push(`\nCurrent page URL: ${url}`);
    }

    if (pageText) {
      const truncatedText = this.truncateText(pageText, MAX_CONTEXT_LENGTH);
      parts.push(`\nPage content (text):\n${truncatedText}`);
    }

    parts.push(
      "\nPlease provide helpful, accurate, and contextual responses about the current webpage.",
      "If the user asks about specific content, refer to the page content and/or screenshot provided."
    );

    return parts.join("\n");
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  }

  private async streamResponse(
    messages: CoreMessage[],
    messageId: string
  ): Promise<void> {
    if (!this.model) {
      throw new Error("Model not initialized");
    }

    try {
      const result = await streamText({
        model: this.model,
        messages,
        temperature: DEFAULT_TEMPERATURE,
        maxRetries: 3,
        abortSignal: undefined, // Could add abort controller for cancellation
      });

      await this.processStream(result.textStream, messageId);
    } catch (error) {
      throw error; // Re-throw to be handled by the caller
    }
  }

  private async processStream(
    textStream: AsyncIterable<string>,
    messageId: string
  ): Promise<void> {
    let accumulatedText = "";

    // Create a placeholder assistant message
    const assistantMessage: CoreMessage = {
      role: "assistant",
      content: "",
    };

    // Keep track of the index for updates
    const messageIndex = this.messages.length;
    this.messages.push(assistantMessage);

    for await (const chunk of textStream) {
      accumulatedText += chunk;

      // Update assistant message content
      this.messages[messageIndex] = {
        role: "assistant",
        content: accumulatedText,
      };
      this.sendMessagesToRenderer();

      this.sendStreamChunk(messageId, {
        content: chunk,
        isComplete: false,
      });
    }

    // Final update with complete content
    this.messages[messageIndex] = {
      role: "assistant",
      content: accumulatedText,
    };
    this.sendMessagesToRenderer();

    // Send the final complete signal
    this.sendStreamChunk(messageId, {
      content: accumulatedText,
      isComplete: true,
    });
  }

  private handleStreamError(error: unknown, messageId: string): void {
    console.error("Error streaming from LLM:", error);

    const errorMessage = this.getErrorMessage(error);
    this.sendErrorMessage(messageId, errorMessage);
  }

  private getErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return "An unexpected error occurred. Please try again.";
    }

    const message = error.message.toLowerCase();

    if (message.includes("401") || message.includes("unauthorized")) {
      return "Authentication error: Please check your API key in the .env file.";
    }

    if (message.includes("429") || message.includes("rate limit")) {
      return "Rate limit exceeded. Please try again in a few moments.";
    }

    if (
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("econnrefused")
    ) {
      return "Network error: Please check your internet connection.";
    }

    if (message.includes("timeout")) {
      return "Request timeout: The service took too long to respond. Please try again.";
    }

    return "Sorry, I encountered an error while processing your request. Please try again.";
  }

  private sendErrorMessage(messageId: string, errorMessage: string): void {
    this.sendStreamChunk(messageId, {
      content: errorMessage,
      isComplete: true,
    });
  }

  private sendStreamChunk(messageId: string, chunk: StreamChunk): void {
    this.webContents.send("chat-response", {
      messageId,
      content: chunk.content,
      isComplete: chunk.isComplete,
    });
  }
}
