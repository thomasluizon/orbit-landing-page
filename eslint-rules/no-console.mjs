import { builtinRules } from "eslint/use-at-your-own-risk";
const noConsole = builtinRules.get("no-console");

function guardedByDev(node, sourceCode) {
  for (const ancestor of sourceCode.getAncestors(node).reverse()) {
    if (/Function/.test(ancestor.type)) return false;
    if (ancestor.type !== "IfStatement") continue;
    if (sourceCode.getText(ancestor.test) !== "import.meta.env.DEV") continue;
    if (
      node.range[0] >= ancestor.consequent.range[0] &&
      node.range[1] <= ancestor.consequent.range[1]
    )
      return true;
  }
  return false;
}

export default {
  meta: noConsole.meta,
  create(context) {
    const guardedContext = Object.create(context, {
      report: {
        value(descriptor) {
          if (!guardedByDev(descriptor.node, context.sourceCode)) context.report(descriptor);
        },
      },
    });
    return noConsole.create(guardedContext);
  },
};
