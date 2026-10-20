import { parse } from "parse5";

export function scriptsFrom(source) {
  const scripts = [];
  function visit(node) {
    if (node.tagName === "script") {
      const { startTag, endTag } = node.sourceCodeLocation;
      scripts.push({
        attributes: Object.fromEntries(node.attrs.map(({ name, value }) => [name, value])),
        body: source.slice(startTag.endOffset, endTag?.startOffset ?? source.length),
      });
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  }
  visit(parse(source, { sourceCodeLocationInfo: true }));
  return scripts;
}
