/**
 * Splits a stylesheet into style rules. Each rule keeps its selector, its declarations and the
 * at-rule conditions that wrap it.
 */
export function stylesheetRules(source) {
  const parents = [];
  const rules = [];
  for (const [, text, boundary] of source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/([^{}]*)([{}])/g)) {
    if (boundary === "{") {
      parents.push(text.trim());
      continue;
    }
    const selector = parents.pop();
    if (selector && !selector.startsWith("@")) {
      rules.push({ selector, declarations: text, conditions: [...parents] });
    }
  }
  return rules;
}
