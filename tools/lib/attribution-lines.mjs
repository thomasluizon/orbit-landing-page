/**
 * An attribution line is a co-author trailer (a line that starts with "Co-Authored-By:", in any
 * letter case) or a line that starts with "Generated with", after any emoji or punctuation. A
 * mention of either string inside a sentence is not an attribution line, so a rule that names
 * them still passes. The banned lines match the orbit-ui-mobile guard of the same name.
 */
const ATTRIBUTION_LINES = [
  { label: "a co-author trailer", pattern: /^\s*co-authored-by\s*:/i },
  { label: "a generated-with line", pattern: /^[^\p{L}\p{N}]*generated with\b/iu },
];

/** One `<source> line <n>: <label>: <line>` finding per attribution line in `text`. */
export const attributionFindings = (source, text) =>
  text
    .split(/\r?\n/)
    .flatMap((line, index) =>
      ATTRIBUTION_LINES.filter(({ pattern }) => pattern.test(line)).map(
        ({ label }) => `${source} line ${index + 1}: ${label}: ${line.trim()}`,
      ),
    );
