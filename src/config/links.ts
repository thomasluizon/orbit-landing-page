export const appUrl = import.meta.env.PUBLIC_APP_URL || "https://app.useorbit.org";
export const googlePlayUrl =
  import.meta.env.PUBLIC_ANDROID_INSTALL_URL ||
  "https://play.google.com/store/apps/details?id=org.useorbit.app";

/** Resolves only the native variants whose web origin and Play package agree. */
export function androidEntryTarget(webUrl: string, installUrl: string) {
  try {
    const web = new URL(webUrl);
    const play = new URL(installUrl);
    const variants: Record<string, { scheme: string; packageName: string }> = {
      "https://app.useorbit.org": { scheme: "orbit", packageName: "org.useorbit.app" },
      "https://app-staging.useorbit.org": {
        scheme: "orbit-staging",
        packageName: "org.useorbit.app.staging",
      },
    };
    const variant = variants[web.origin];
    if (
      !variant ||
      web.pathname !== "/" ||
      web.search ||
      web.hash ||
      web.username ||
      web.password ||
      play.origin !== "https://play.google.com" ||
      play.pathname !== "/store/apps/details" ||
      play.hash ||
      play.username ||
      play.password ||
      play.searchParams.getAll("id").length !== 1 ||
      play.searchParams.get("id") !== variant.packageName
    )
      return;
    return { ...variant, origin: web.origin, fallback: installUrl };
  } catch {
    return;
  }
}

const desktopReleaseUrl =
  "https://github.com/thomasluizon/orbit-ui-mobile/releases/download/desktop-production";

/** Stable production desktop installers that the orbit-ui-mobile desktop release moves forward. */
export const desktopDownloads = [
  {
    id: "mac-arm",
    system: "mac",
    architecture: "arm",
    copy: "footer.mac.arm",
    url: desktopReleaseUrl + "/orbit-aarch64-apple-darwin.dmg",
  },
  {
    id: "mac-x86",
    system: "mac",
    architecture: "x86",
    copy: "footer.mac.intel",
    url: desktopReleaseUrl + "/orbit-x86_64-apple-darwin.dmg",
  },
  {
    id: "windows-x86",
    system: "windows",
    architecture: "x86",
    copy: "footer.windows.x64",
    url: desktopReleaseUrl + "/orbit-x86_64-pc-windows-msvc.exe",
  },
  {
    id: "windows-arm",
    system: "windows",
    architecture: "arm",
    copy: "footer.windows.arm",
    url: desktopReleaseUrl + "/orbit-aarch64-pc-windows-msvc.exe",
  },
] as const;
