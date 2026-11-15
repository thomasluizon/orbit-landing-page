const DIRECTIVE =
  /^(eslint-disable|eslint-enable|eslint-disable-line|eslint-disable-next-line|eslint-env|global\s|globals\s|exported\s|@ts-|ts-|prettier-ignore|@jsx|c8\s|v8\s|istanbul\s|webpack|@vite|@vitest|@license|@preserve|@__PURE__|#__PURE__)/;
const URL_RE = /https?:\/\//;
const TYPE_ANNOTATION =
  /@(?:type|typedef|satisfies|template|import)(?![\w-])|@(?:param|returns)\s*\{/;
const JAVASCRIPT_FILE = /\.[cm]?jsx?$/;
const ASTRO_FILE = /\.astro$/;

const EXPORT_STATEMENTS = new Set([
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
  "ExportAllDeclaration",
  "TSExportAssignment",
]);
const NAMED_DECLARATIONS = new Set([
  "FunctionDeclaration",
  "TSDeclareFunction",
  "ClassDeclaration",
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSEnumDeclaration",
  "TSModuleDeclaration",
]);
const MEMBERS = new Set([
  "Property",
  "MethodDefinition",
  "PropertyDefinition",
  "AccessorProperty",
  "TSAbstractMethodDefinition",
  "TSAbstractPropertyDefinition",
  "TSAbstractAccessorProperty",
  "TSPropertySignature",
  "TSMethodSignature",
  "TSIndexSignature",
  "TSCallSignatureDeclaration",
  "TSConstructSignatureDeclaration",
  "TSEnumMember",
]);
const MEMBER_OWNERS = new Set([
  "ClassDeclaration",
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSEnumDeclaration",
  "VariableDeclarator",
  "ExportDefaultDeclaration",
  "TSExportAssignment",
  "AssignmentExpression",
]);
const MEMBER_PATH = new Set([
  "ObjectExpression",
  "ArrayExpression",
  "Property",
  "PropertyDefinition",
  "ClassExpression",
  "ClassBody",
  "TSInterfaceBody",
  "TSEnumBody",
  "TSTypeLiteral",
  "TSTypeAnnotation",
  "TSTypeReference",
  "TSTypeParameterInstantiation",
  "TSTypeOperator",
  "TSNamedTupleMember",
  "TSPropertySignature",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "TSNonNullExpression",
]);
const isMemberPath = (node) => MEMBER_PATH.has(node.type) || /^TS\w+Type$/.test(node.type);

function bindingNames(pattern) {
  if (!pattern) return [];
  if (pattern.type === "Identifier") return [pattern.name];
  if (pattern.type === "ObjectPattern") {
    return pattern.properties.flatMap((property) => bindingNames(property.value ?? property));
  }
  if (pattern.type === "ArrayPattern") return pattern.elements.flatMap(bindingNames);
  if (pattern.type === "RestElement") return bindingNames(pattern.argument);
  if (pattern.type === "AssignmentPattern") return bindingNames(pattern.left);
  return [];
}

function isCommonJsExportTarget(node) {
  if (node.type !== "MemberExpression") return false;
  const { object, property } = node;
  if (object.type === "Identifier") {
    if (object.name === "exports") return true;
    return (
      object.name === "module" && property.type === "Identifier" && property.name === "exports"
    );
  }
  return isCommonJsExportTarget(object);
}

const isCommonJsExport = (node) =>
  node.type === "AssignmentExpression" && isCommonJsExportTarget(node.left);

function identifierValues(node) {
  if (node.type === "Identifier") return [node.name];
  if (node.type !== "ObjectExpression") return [];
  return node.properties.flatMap((property) =>
    property.type === "Property" && property.value.type === "Identifier"
      ? [property.value.name]
      : [],
  );
}

function exportedLocalNames(program) {
  const names = new Set();
  for (const statement of program.body) {
    if (statement.type === "ExportNamedDeclaration" && !statement.source) {
      for (const specifier of statement.specifiers) names.add(specifier.local.name);
    } else if (statement.type === "ExportDefaultDeclaration") {
      for (const name of identifierValues(statement.declaration)) names.add(name);
    } else if (statement.type === "TSExportAssignment") {
      for (const name of identifierValues(statement.expression)) names.add(name);
    } else if (statement.type === "ExpressionStatement" && isCommonJsExport(statement.expression)) {
      for (const name of identifierValues(statement.expression.right)) names.add(name);
    }
  }
  return names;
}

function declaredNames(node) {
  if (node.type === "VariableDeclaration") {
    return node.declarations.flatMap((declarator) => bindingNames(declarator.id));
  }
  if (node.type === "VariableDeclarator") return bindingNames(node.id);
  if (NAMED_DECLARATIONS.has(node.type)) return bindingNames(node.id);
  return [];
}

function createExportCheck(sourceCode, filename) {
  const exportedNames = exportedLocalNames(sourceCode.ast);
  const isAstroFrontmatter = ASTRO_FILE.test(filename);

  function isExportedDeclaration(node) {
    if (EXPORT_STATEMENTS.has(node.type)) return true;
    if (node.type === "ExpressionStatement") return isCommonJsExport(node.expression);
    if (node.type === "AssignmentExpression") return isCommonJsExport(node);
    const statement = node.type === "VariableDeclarator" ? node.parent : node;
    if (EXPORT_STATEMENTS.has(statement.parent?.type)) return true;
    if (statement.parent?.type !== "Program") return false;
    const names = declaredNames(node);
    if (names.some((name) => exportedNames.has(name))) return true;
    const isPropsType =
      node.type === "TSInterfaceDeclaration" || node.type === "TSTypeAliasDeclaration";
    return isAstroFrontmatter && isPropsType && names.includes("Props");
  }

  function isMemberOfExported(member) {
    let owner = member.parent;
    while (owner && !MEMBER_OWNERS.has(owner.type)) {
      if (!isMemberPath(owner)) return false;
      owner = owner.parent;
    }
    return Boolean(owner) && isExportedDeclaration(owner);
  }

  return function isOnExportedSymbol(comment) {
    const next = sourceCode.getTokenAfter(comment);
    if (!next) return false;
    let node = sourceCode.getNodeByRangeIndex(next.range[0]);
    if (!node || node.type === "Program") return false;
    while (node.parent.type !== "Program" && node.parent.range[0] === node.range[0]) {
      node = node.parent;
    }
    if (node.range[0] !== next.range[0]) return false;
    if (MEMBERS.has(node.type)) return isMemberOfExported(node);
    return isExportedDeclaration(node);
  };
}

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow comments except /** */ JSDoc on an exported symbol, tooling directives, and WHY notes that link an upstream URL.",
    },
    fixable: "code",
    schema: [],
    messages: {
      noComment:
        "Remove this comment. Only /** */ JSDoc on an exported symbol, tooling directives, or a WHY note linking an upstream URL are allowed. Rename or extract instead of narrating.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const filename = context.filename ?? context.getFilename();
    const isOnExportedSymbol = createExportCheck(sourceCode, filename);

    function isAllowed(comment) {
      if (URL_RE.test(comment.value)) return true;
      const isDocComment = comment.type === "Block" && comment.value.startsWith("*");
      const value = (isDocComment ? comment.value.replace(/^\*+/, "") : comment.value).trim();
      if (comment.type === "Line" && value.startsWith("/")) return true;
      if (DIRECTIVE.test(value)) return true;
      if (!isDocComment) return false;
      if (JAVASCRIPT_FILE.test(filename) && TYPE_ANNOTATION.test(comment.value)) return true;
      return isOnExportedSymbol(comment);
    }

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
