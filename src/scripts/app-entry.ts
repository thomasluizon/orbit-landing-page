import { androidEntryTarget, appUrl, googlePlayUrl } from "../config/links";

const target = androidEntryTarget(appUrl, googlePlayUrl);

function supportedDestination(destination: URL) {
  if (destination.pathname === "/" || destination.pathname === "/upgrade")
    return !destination.search;
  const entries = [...destination.searchParams];
  if (destination.pathname !== "/habits/new" || entries.length !== 1 || entries[0][0] !== "title")
    return false;
  // https://github.com/expo/expo/blob/main/packages/expo-router/src/fork/extractPathFromURL.ts decodes query values before reparsing them; keep lossy titles on the web.
  return !/[&#+%]|\s$/u.test(entries[0][1]) && !/[\r\n\t]/u.test(entries[0][1]);
}

function entryIntent(href: string) {
  if (!target) return;
  try {
    const destination = new URL(href);
    if (
      destination.origin !== target.origin ||
      destination.username ||
      destination.password ||
      destination.hash ||
      !supportedDestination(destination)
    )
      return;
    const route = `${destination.pathname}${destination.search}`.replaceAll(";", "%3B");
    return `intent://${route}#Intent;scheme=${target.scheme};package=${target.packageName};S.browser_fallback_url=${encodeURIComponent(target.fallback)};end`;
  } catch {
    return;
  }
}

function openApp(event: MouseEvent) {
  if (
    !event.isTrusted ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !/\bAndroid\b/i.test(navigator.userAgent) ||
    !/\bChrome\/\d+/u.test(navigator.userAgent) ||
    /\b(?:wv|Version|EdgA|OPR|SamsungBrowser|UCBrowser|FBAN|FBAV|Instagram)\b/u.test(
      navigator.userAgent,
    ) ||
    !(event.target instanceof Element)
  )
    return;
  const anchor = event.target.closest<HTMLAnchorElement>("a[data-app-entry]");
  if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self"))
    return;
  const intent = entryIntent(anchor.href);
  if (!intent) return;
  try {
    window.location.assign(intent);
    event.preventDefault();
  } catch {
    return;
  }
}

document.addEventListener("click", openApp);
