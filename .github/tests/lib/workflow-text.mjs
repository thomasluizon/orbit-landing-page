export function topLevelBlock(text, key) {
  const lines = text.split("\n");
  const start = lines.indexOf(`${key}:`);
  if (start < 0) {
    return null;
  }
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith(" ")) {
      break;
    }
    body.push(line);
  }
  return body.join("\n");
}

export function stepBlock(text, name) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  if (start < 0) {
    return null;
  }
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith("- name:")) {
      break;
    }
    body.push(line);
  }
  return body.join("\n");
}
