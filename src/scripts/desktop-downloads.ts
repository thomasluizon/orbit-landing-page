type DesktopSystem = "mac" | "windows";

interface UserAgentData {
  platform: string;
  getHighEntropyValues(hints: string[]): Promise<{ architecture?: string }>;
}

type VisitorNavigator = Pick<Navigator, "userAgent" | "maxTouchPoints"> & {
  userAgentData?: UserAgentData;
};

function desktopSystem(
  userAgent: string,
  platform = "",
  touchPoints = 0,
): DesktopSystem | undefined {
  if (/\b(?:Android|iPhone|iPad|iPod|Mobile)\b/i.test(userAgent)) return;
  if (platform === "Windows" || /\bWindows NT\b/.test(userAgent)) return "windows";
  if (touchPoints > 1) return;
  if (platform === "macOS" || /\bMacintosh\b/.test(userAgent)) return "mac";
}

function leadDownloadLinks(root: ParentNode, system: DesktopSystem, architecture?: string) {
  const links = [...root.querySelectorAll<HTMLElement>("[data-desktop-download]")];
  const parent = links[0]?.parentNode;
  if (!parent) return;
  const next = links[links.length - 1].nextSibling;
  const preferred =
    architecture === "arm" || architecture === "x86"
      ? architecture
      : system === "mac"
        ? "arm"
        : "x86";
  const rank = ({ dataset }: HTMLElement) =>
    dataset.desktopSystem !== system ? 2 : dataset.desktopArchitecture === preferred ? 0 : 1;
  for (const link of links.sort((a, b) => rank(a) - rank(b))) parent.insertBefore(link, next);
}

function leadVisitorDownloads(root: ParentNode, visitor: VisitorNavigator) {
  const hints = visitor.userAgentData;
  const system = desktopSystem(visitor.userAgent, hints?.platform, visitor.maxTouchPoints);
  if (!system) return;
  leadDownloadLinks(root, system);
  hints
    ?.getHighEntropyValues(["architecture"])
    .then(({ architecture }) => leadDownloadLinks(root, system, architecture))
    .catch(() => undefined);
}

leadVisitorDownloads(document, navigator);
