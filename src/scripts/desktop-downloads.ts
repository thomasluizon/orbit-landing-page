import { desktopDownloads } from "../config/links";

type DesktopDownload = (typeof desktopDownloads)[number];
type DesktopSystem = DesktopDownload["system"];
type DesktopArchitecture = DesktopDownload["architecture"];

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

function leadDownloads(system?: DesktopSystem, architecture?: string): DesktopDownload["id"][] {
  const ids = desktopDownloads.map((download) => download.id);
  if (!system) return ids;
  const preferred: DesktopArchitecture =
    architecture === "arm" || architecture === "x86"
      ? architecture
      : system === "mac"
        ? "arm"
        : "x86";
  const rank = (download: DesktopDownload) =>
    download.system !== system ? 2 : download.architecture === preferred ? 0 : 1;
  return [...desktopDownloads].sort((a, b) => rank(a) - rank(b)).map((download) => download.id);
}

function orderDownloadLinks(root: ParentNode, order: readonly string[]) {
  const links = [...root.querySelectorAll<HTMLElement>("[data-desktop-download]")];
  const parent = links[0]?.parentNode;
  if (!parent || links.length !== order.length) return;
  const next = links[links.length - 1].nextSibling;
  for (const id of order) {
    const link = links.find((candidate) => candidate.dataset.desktopDownload === id);
    if (link) parent.insertBefore(link, next);
  }
}

function leadVisitorDownloads(root: ParentNode, visitor: VisitorNavigator) {
  const hints = visitor.userAgentData;
  const system = desktopSystem(visitor.userAgent, hints?.platform, visitor.maxTouchPoints);
  orderDownloadLinks(root, leadDownloads(system));
  if (!system || !hints) return Promise.resolve();
  return hints
    .getHighEntropyValues(["architecture"])
    .then(({ architecture }) => orderDownloadLinks(root, leadDownloads(system, architecture)))
    .catch(() => undefined);
}

void leadVisitorDownloads(document, navigator);
