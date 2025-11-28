/**
 * Shared utilities for resolving CSS and XPath selectors
 */

/**
 * Resolves a selector string (CSS or XPath) to a DOM element
 * @param selector - CSS selector or XPath selector (prefixed with "xpath=")
 * @param context - Document context (defaults to document)
 * @returns The resolved Element or null if not found
 */
export function resolveSelector(
  selector: string,
  context: Document = document
): Element | null {
  if (selector.startsWith("xpath=")) {
    const xpath = selector.slice("xpath=".length);
    const result = context.evaluate(
      xpath,
      context,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue as Element | null;
  }

  return context.querySelector(selector);
}

/**
 * Resolves a selector and throws an error if not found
 * @param selector - CSS selector or XPath selector (prefixed with "xpath=")
 * @param context - Document context (defaults to document)
 * @returns The resolved Element
 * @throws Error if element is not found
 */
export function resolveSelectorOrThrow(
  selector: string,
  context: Document = document
): Element {
  const element = resolveSelector(selector, context);
  if (!element) {
    throw new Error(`No element found for selector: ${selector}`);
  }
  return element;
}

/**
 * Checks if a selector is an XPath selector
 * @param selector - Selector string to check
 * @returns True if selector is XPath, false otherwise
 */
export function isXPathSelector(selector: string): boolean {
  return selector.startsWith("xpath=");
}
