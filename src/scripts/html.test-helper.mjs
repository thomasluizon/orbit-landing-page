import { parse, walkSync } from "ultrahtml";

export function scriptsFrom(source) {
  const normalized = source.replace(/(<\/?)script(?=[\t\n\f\r />])/gi, "$1script");
  const scripts = [];
  walkSync(parse(normalized), (node) => {
    if (node.name !== "script") return;
    const [opening, closing] = node.loc;
    if (closing) {
      scripts.push({
        attributes: node.attributes,
        body: source.slice(opening.end, closing.start),
      });
    }
  });
  return scripts;
}
