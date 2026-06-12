/**
 * Local ESLint rule: forbid narration comments.
 *
 * Code must read without prose. The only comments allowed are:
 *  - `/** *​/` JSDoc blocks (doc a symbol's intent/contract),
 *  - tooling directives (eslint-disable, @ts-expect-error, /// <reference>, coverage/bundler pragmas),
 *  - a WHY note that links an upstream issue/PR/doc URL (a real external constraint).
 *
 * Everything else is removed by `--fix`. AST-based, so `//` inside strings, URLs,
 * and regex literals is never touched.
 */

const DIRECTIVE =
  /^(eslint-disable|eslint-enable|eslint-disable-line|eslint-disable-next-line|eslint-env|global\s|globals\s|exported\s|@ts-|ts-|prettier-ignore|@jsx|c8\s|v8\s|istanbul\s|webpack|@vite|@vitest|@__PURE__|#__PURE__)/;
const URL_RE = /https?:\/\//;

function isAllowed(comment) {
  if (comment.type === "Block" && comment.value.startsWith("*")) return true;
  const value = comment.value.trim();
  if (comment.type === "Line" && value.startsWith("/")) return true;
  if (DIRECTIVE.test(value)) return true;
  if (URL_RE.test(comment.value)) return true;
  return false;
}

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow comments except JSDoc, tooling directives, and WHY notes that link an upstream URL.",
    },
    fixable: "code",
    schema: [],
    messages: {
      noComment:
        "Remove this comment. Only /** */ JSDoc, tooling directives, or a WHY note linking an upstream URL are allowed — rename or extract instead of narrating.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (isAllowed(comment)) continue;
          context.report({
            loc: comment.loc,
            messageId: "noComment",
            fix(fixer) {
              const text = sourceCode.getText();
              let start = comment.range[0];
              let end = comment.range[1];
              let lineStart = start;
              while (lineStart > 0 && text[lineStart - 1] !== "\n") lineStart--;
              const beforeComment = text.slice(lineStart, start);
              const isJsxContainer = beforeComment.trim() === "{" && text[end] === "}";
              if (isJsxContainer) {
                start = lineStart;
                end += 1;
                if (text[end] === "\r") end++;
                if (text[end] === "\n") end++;
              } else if (beforeComment.trim() === "") {
                start = lineStart;
                if (text[end] === "\r") end++;
                if (text[end] === "\n") end++;
              } else {
                while (start > lineStart && (text[start - 1] === " " || text[start - 1] === "\t")) {
                  start--;
                }
              }
              return fixer.removeRange([start, end]);
            },
          });
        }
      },
    };
  },
};
