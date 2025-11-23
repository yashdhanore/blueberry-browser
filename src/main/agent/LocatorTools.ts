import type { ToolSet } from "ai";
import type { Page } from "@browserbasehq/stagehand";
import { z } from "zod";

type PageSupplier = () => Promise<Page> | Page;

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

const resolveLocator = async (page: Page, selector: string) => {
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

export const createLocatorTools = (pageSupplier: PageSupplier): ToolSet => {
  return {
    click_selector: {
      description:
        "Clicks the element that matches the provided CSS or XPath selector.",
      inputSchema: clickSchema,
      execute: async (args) => {
        const parsed = clickSchema.parse(args);
        const page = await resolvePage(pageSupplier);
        const locator = await resolveLocator(page, parsed.selector);

        await locator.click({
          button: parsed.button ?? "left",
          clickCount: parsed.clickCount ?? 1,
        });

        return {
          selector: parsed.selector,
        };
      },
    },
    fill_selector: {
      description:
        "Focuses the matching element, clears it, fills the provided value, and optionally presses Enter afterwards.",
      inputSchema: fillSchema,
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
      inputSchema: typeSchema,
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
      inputSchema: keySchema,
      execute: async (args) => {
        const parsed = keySchema.parse(args);
        const page = await resolvePage(pageSupplier);

        await page.keyPress(parsed.keys);

        return {
          keys: parsed.keys,
        };
      },
    },
  };
};
