import { generateText, type LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import * as dotenv from "dotenv";
import { join } from "path";

// Load environment variables
dotenv.config({ path: join(__dirname, "../../.env") });

type LLMProvider = "openai" | "anthropic";

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-4.1-nano",
  anthropic: "claude-3-5-sonnet-20241022",
};

export type RouteDecision = "chat" | "agent";

interface RouterResult {
  route: RouteDecision;
  confidence?: number;
  reasoning?: string;
}

export class LLMRouter {
  private readonly provider: LLMProvider;
  private readonly modelName: string;
  private readonly model: LanguageModel | null;

  constructor() {
    this.provider = this.getProvider();
    this.modelName = this.getModelName();
    this.model = this.initializeModel();
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

  /**
   * Classify a user message to determine if it should be handled as a chat message
   * or routed to the Stagehand agent for browser automation.
   */
  async routeMessage(userMessage: string): Promise<RouterResult> {
    // If no model is available, default to chat
    if (!this.model) {
      console.warn("LLM Router: No model available, defaulting to chat");
      return { route: "chat" };
    }

    try {
      const prompt = `You are a message router for a browser assistant. Your job is to determine if a user's message requires browser automation (clicking, typing, navigating) or can be answered with a normal chat response.

Examples of messages that require browser automation (route: "agent"):
- "Click the login button"
- "Fill out the form with my email"
- "Search for 'best restaurants' on this page"
- "Navigate to the checkout page"
- "Add this item to cart"
- "Submit the form"
- "Click on the first result"
- "Fill in my name and address"

Examples of messages that are normal chat (route: "chat"):
- "What is the weather today?"
- "Explain how React works"
- "What's on this page?"
- "Summarize the content"
- "What does this website do?"
- "Tell me about the features"
- "How do I use this?"
- General questions or explanations

User message: "${userMessage}"

Respond with ONLY one word: either "chat" or "agent". Do not include any explanation or additional text.`;

      const result = await generateText({
        model: this.model,
        prompt,
        temperature: 0.1, // Low temperature for consistent routing
        maxTokens: 10,
      });

      const route = result.text.trim().toLowerCase();

      if (route === "agent") {
        return { route: "agent" };
      }

      // Default to chat for safety
      return { route: "chat" };
    } catch (error) {
      console.error("Error routing message:", error);
      // On error, default to chat for safety
      return { route: "chat" };
    }
  }
}
