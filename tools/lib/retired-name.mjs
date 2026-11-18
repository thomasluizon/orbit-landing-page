const word = ["as", "tra"].join("");

/** The retired AI name, in any letter case. The source spells it in parts so this file never matches itself. */
export const retiredName = new RegExp(word, "i");

/** The demo anchor id. It keeps the retired name because a published link can point at it. */
export const demoAnchor = `${word}-demo`;

const legalLine = `"Orbit" and "${word[0].toUpperCase()}${word.slice(1)}"`;

/**
 * One `<path> line <n>: <line>` finding for each line of `text` that holds the retired name
 * outside the two allowed uses: the demo anchor id, and the trademark line of `LICENSE`.
 */
export function retiredNameFindings(path, text) {
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (path === "LICENSE" && line.startsWith(legalLine)) return [];
    if (!retiredName.test(line.replaceAll(demoAnchor, ""))) return [];
    return [`${path} line ${index + 1}: ${line.trim()}`];
  });
}
