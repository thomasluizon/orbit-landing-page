export {};

type DesktopSystem = "mac" | "windows";
type VisitorSystem = DesktopSystem | "android" | "iphone";

interface UserAgentData {
  getHighEntropyValues(hints: string[]): Promise<{ architecture?: string }>;
}

type VisitorNavigator = Pick<Navigator, "userAgent" | "maxTouchPoints"> & {
  userAgentData?: UserAgentData;
};

function visitorSystem(userAgent: string, touchPoints = 0): VisitorSystem | undefined {
  if (/\bAndroid\b/i.test(userAgent)) return "android";
  if (/\b(?:iPhone|iPad|iPod)\b/i.test(userAgent)) return "iphone";
  if (/\bMobile\b/i.test(userAgent)) return;
  if (/\bWindows NT\b/.test(userAgent)) return "windows";
  if (/\bMacintosh\b/.test(userAgent)) return touchPoints > 1 ? "iphone" : "mac";
}

const isDesktop = (system: VisitorSystem): system is DesktopSystem =>
  system === "mac" || system === "windows";

const reportsArchitecture = (architecture?: string) =>
  architecture === "arm" || architecture === "x86";

function preferredArchitecture(system: DesktopSystem, architecture?: string) {
  if (reportsArchitecture(architecture)) return architecture;
  return system === "mac" ? "arm" : "x86";
}

function leadDownload(root: ParentNode, system: VisitorSystem, architecture?: string) {
  const hero = root.querySelector<HTMLAnchorElement>("#hero-download");
  const file = isDesktop(system) && `${system}-${preferredArchitecture(system, architecture)}`;
  const source = root.querySelector<HTMLElement>(
    file ? `[data-desktop-download="${file}"]` : `[data-download-target="${system}"]`,
  );
  const href = source?.getAttribute("href");
  if (!hero || !source || !href) return;
  const list = source.parentElement;
  list?.prepend(...root.querySelectorAll(`[data-desktop-system="${system}"]`));
  list?.prepend(source);
  hero.href = href;
  if (source.dataset.iosTrigger !== undefined) hero.dataset.iosTrigger = "";
  const event = source.dataset.analyticsEvent;
  if (event)
    Object.assign(hero.dataset, {
      analyticsEvent: event,
      analyticsSurface: `hero_${(file || system).replace("-", "_")}`,
    });
  const shown = system === "mac" && !reportsArchitecture(architecture) ? "mac-unreported" : system;
  for (const label of hero.querySelectorAll<HTMLElement>("[data-hero-download-label]"))
    label.hidden = label.dataset.heroDownloadLabel !== shown;
}

function leadVisitorDownloads(root: ParentNode, visitor: VisitorNavigator) {
  const system = visitorSystem(visitor.userAgent, visitor.maxTouchPoints);
  if (!system) return;
  leadDownload(root, system);
  if (!isDesktop(system)) return;
  visitor.userAgentData
    ?.getHighEntropyValues(["architecture"])
    .then(({ architecture }) => leadDownload(root, system, architecture))
    .catch(() => undefined);
}

leadVisitorDownloads(document, navigator);
