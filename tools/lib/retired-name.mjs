const word = ["as", "tra"].join("");
const capitalised = `${word[0].toUpperCase()}${word.slice(1)}`;

/** The retired AI name as lowercase text. The source spells it in parts so this file never matches itself. */
export const retiredWord = word;

/** The retired AI name with a leading capital letter. */
export const retiredCapitalised = capitalised;

/**
 * The retired AI name as an identifier, a class, a path or a sentence word. It matches the lowercase name
 * on its own, the capitalised name and the upper case name. It skips the same letters inside an ordinary
 * word, such as "cadastrado" or "astray".
 */
export const retiredName = new RegExp(
  `(?<![a-z])${word}(?![a-z])|${capitalised}|(?<![A-Z])${word.toUpperCase()}(?![A-Z])`,
);

/** The pt-BR feminine article before Orbit, which is masculine in pt-BR. The lookbehind covers a contraction such as the one that starts with a non-ASCII letter. */
export const feminineOrbit = /(?<!\p{L})(?:a|da|na|à|pela)\s+Orbit\b/iu;

/** The demo anchor id. It keeps the retired name because a published link can point at it. */
export const demoAnchor = `${word}-demo`;

const legalLine = `"Orbit" and "${capitalised}"`;

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
