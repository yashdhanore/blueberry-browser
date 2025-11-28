import type { ToolSet } from "ai";
import type { Page } from "@browserbasehq/stagehand";
import { z } from "zod";
import type { StagehandActExecutor } from "./StagehandActExecutor";

type PageSupplier = () => Promise<Page> | Page;
type ActExecutorSupplier = () => StagehandActExecutor | null;

const CLICK_BUTTONS = ["left", "right", "middle"] as const;

const clickSchema = z.object({
  selector: z.string().min(1, "selector is required"),
  button: z.enum(CLICK_BUTTONS).optional(),
  clickCount: z.number().int().min(1).max(3).optional(),
});

const fillSchema = z.object({
  selector: z.string().min(1, "selector is required"),
  value: z.string(),
  pressEnter: z.boolean().optional(),
});

const typeSchema = z.object({
  selector: z.string().min(1, "selector is required"),
  text: z.string(),
  delayMs: z.number().min(0).max(1000).optional(),
  clearFirst: z.boolean().optional(),
  pressEnter: z.boolean().optional(),
});

const keySchema = z.object({
  keys: z.string().min(1, "keys are required"),
});

const actInstructionSchema = z.object({
  instruction: z.string().min(1, "instruction is required"),
  variables: z.record(z.string(), z.string()).optional(),
  timeout: z.number().optional(),
});

/**
 * Resolves a Playwright locator for the given selector
 * @throws Error if no element is found
 */
const resolveLocator = async (
  page: Page,
  selector: string
): Promise<ReturnType<Page["locator"]>> => {
  const locator = page.locator(selector);
  const matchCount = await locator.count();

  if (matchCount === 0) {
    throw new Error(`No element found for selector "${selector}"`);
  }

  return locator;
};

const resolvePage = async (supplier: PageSupplier): Promise<Page> => {
  return await Promise.resolve(supplier());
};

export const createLocatorTools = (
  pageSupplier: PageSupplier,
  actExecutorSupplier?: ActExecutorSupplier
): ToolSet => {
  return {
    click_selector: {
      description:
        "Clicks the element that matches the provided CSS or XPath selector.",
      inputSchema: clickSchema as any,
      execute: async (args) => {
        const parsed = clickSchema.parse(args);
        const page = await resolvePage(pageSupplier);

        await page.evaluate((sel: string) => {
          let element: Element | null = null;

          if (sel.startsWith("xpath=")) {
            const xpath = sel.slice("xpath=".length);
            const result = document.evaluate(
              xpath,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            );
            element = result.singleNodeValue as Element | null;
          } else {
            element = document.querySelector(sel);
          }

          if (!element) {
            throw new Error(`No element found for selector: ${sel}`);
          }

          (element as HTMLElement).click();
        }, parsed.selector);

        return {
          selector: parsed.selector,
        };
      },
    },
    fill_selector: {
      description:
        "Focuses the matching element, clears it, fills the provided value, and optionally presses Enter afterwards.",
      inputSchema: fillSchema as any,
      execute: async (args) => {
        const parsed = fillSchema.parse(args);
        const page = await resolvePage(pageSupplier);
        const locator = await resolveLocator(page, parsed.selector);

        await locator.click();
        await locator.fill(parsed.value);

        if (parsed.pressEnter) {
          await page.keyPress("Enter");
        }

        return {
          selector: parsed.selector,
          valueLength: parsed.value.length,
        };
      },
    },
    type_selector: {
      description:
        "Types the provided text into the element that matches the selector. Can optionally clear first, delay typing, and press Enter afterwards.",
      inputSchema: typeSchema as any,
      execute: async (args) => {
        const parsed = typeSchema.parse(args);
        const page = await resolvePage(pageSupplier);
        const locator = await resolveLocator(page, parsed.selector);

        await locator.click();

        if (parsed.clearFirst) {
          await locator.fill("");
        }

        await locator.type(parsed.text, {
          delay: parsed.delayMs,
        });

        if (parsed.pressEnter) {
          await page.keyPress("Enter");
        }

        return {
          selector: parsed.selector,
          typedLength: parsed.text.length,
        };
      },
    },
    press_keys: {
      description:
        "Dispatches a key combination such as Enter, Escape, or Command shortcuts.",
      inputSchema: keySchema as any,
      execute: async (args) => {
        const parsed = keySchema.parse(args);
        const page = await resolvePage(pageSupplier);

        await page.keyPress(parsed.keys);

        return {
          keys: parsed.keys,
        };
      },
    },
    act_instruction: {
      description:
        "Execute a natural language instruction using Stagehand's observe→act pattern. " +
        "First observes candidate actions, then executes deterministically. " +
        "Use this for single-step browser interactions like clicking buttons, filling forms, or selecting dropdowns. " +
        "This tool provides self-healing behavior and automatic adaptation to website changes.",
      inputSchema: actInstructionSchema as any,
      execute: async (args) => {
        const parsed = actInstructionSchema.parse(args);
        const executor = actExecutorSupplier?.();

        if (!executor) {
          throw new Error(
            "StagehandActExecutor not available. This tool requires the act executor to be configured."
          );
        }

        try {
          const result = await executor.actAfterObserve(parsed.instruction, {
            variables: parsed.variables as Record<string, string> | undefined,
            timeout: parsed.timeout,
          });

          if (!result.success) {
            const errorMessage =
              result.error || result.message || "Action execution failed";
            throw new Error(
              `Act instruction "${parsed.instruction}" failed: ${errorMessage}`
            );
          }

          return {
            success: true,
            message: result.message,
            actionDescription: result.actionDescription,
            actionsCount: result.actions.length,
            actions: result.actions.map((a) => ({
              selector: a.selector,
              description: a.description,
              method: a.method,
            })),
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `Act instruction "${parsed.instruction}" failed: ${errorMessage}`
          );
        }
      },
    },
  };
};
