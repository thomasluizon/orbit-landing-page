const pathData = (markup: string, fill: string) =>
  [...markup.matchAll(/<path\b([^>]*)\/>/g)]
    .map(([, attributes]) => attributes)
    .filter((attributes) => attributes.includes(fill))
    .map((attributes) => /\sd="([^"]+)"/.exec(attributes)?.[1] ?? "");

const RING_REST_TILT_DEGREES = -18;
const RING_OPENING = 0.29;
const RING_RADIUS = 180;

/** The parts of the live rig, read from the committed mascot sources at build time. */
export function mascotRig(rigSource: string, happySource: string) {
  const [ringBack, ringFront] = pathData(rigSource, 'fill="currentColor"');
  const [ringOutline] = pathData(rigSource, 'fill="var(--orbit-surface');
  const moon = /<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)" fill="var\(--primary/.exec(rigSource);
  if (!ringBack || !ringFront || !ringOutline || !moon) {
    throw new Error("orbit-mascot.svg must hold the ring halves, the ring outline and the moon");
  }
  const tilt = (RING_REST_TILT_DEGREES * Math.PI) / 180;
  const [x, y] = [Number(moon[1]), Number(moon[2])];
  const flatX = x * Math.cos(-tilt) - y * Math.sin(-tilt);
  const flatY = (x * Math.sin(-tilt) + y * Math.cos(-tilt)) / RING_OPENING;
  return {
    ringBack,
    ringOutline,
    ringFront,
    eyes: pathData(rigSource, 'fill="var(--bg, #09090B)"'),
    happyEyes: pathData(happySource, 'stroke="var(--bg, #09090B)"'),
    moonAngle: Number(((Math.atan2(flatY, flatX) * 180) / Math.PI).toFixed(2)),
    moonRadius: Number(moon[3]),
    ringTilt: RING_REST_TILT_DEGREES,
    ringOpening: RING_OPENING,
    ringRadius: RING_RADIUS,
    moonCounterScale: Number((1 / RING_OPENING).toFixed(4)),
  };
}

/** The small static face at 16 and 24, the two sizes the page draws. The ring outline is a hole cut
 *  from the planet, so the face shows the real surface behind it on the canvas and on a card. */
export function smallFaces(smallSource: string) {
  const native16 = /<symbol id="small-16" viewBox="0 0 16 12">([\s\S]*?)<\/symbol>/.exec(
    smallSource,
  )?.[1];
  const root24 = smallSource.replace(/<defs><symbol[\s\S]*<\/symbol><\/defs>/, "");
  if (!native16) throw new Error("orbit-mascot-small.svg must carry the symbol small-16");
  return [
    { size: 16, width: 16, height: 12, markup: native16 },
    { size: 24, width: 24, height: 18, markup: root24 },
  ].map(({ size, width, height, markup }) => {
    const [ringBack, planet, ringFront] = pathData(markup, 'fill="currentColor"');
    const eyes = pathData(markup, 'fill="var(--bg, #09090B)"');
    const [outline] = pathData(markup, 'fill="var(--orbit-surface');
    const [moon] = pathData(markup, 'fill="var(--primary');
    if (!ringBack || !planet || !ringFront || eyes.length !== 2 || !outline || !moon) {
      throw new Error(`orbit-mascot-small.svg must hold every part of the ${size} face`);
    }
    return {
      size,
      viewBox: `0 0 ${width} ${height}`,
      cut: `M0 0H${width}V${height}H0Z${outline}`,
      ringBack,
      planet,
      eyes,
      ringFront,
      moon,
    };
  });
}
