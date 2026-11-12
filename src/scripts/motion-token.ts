/** Reads a motion token from the root element, such as an easing curve. */
export function motionToken(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Reads a duration token in milliseconds from its CSS time, `220ms` or the built `.22s`. */
export function durationToken(name: string) {
  const value = motionToken(name);
  const amount = Number.parseFloat(value);
  return value.endsWith("ms") ? amount : amount * 1000;
}
