/** Accepts only an HTTPS App Store product page of the form apps.apple.com/[storefront/]app/[name/]id<digits>. */
export function appStoreEntryUrl(value: unknown) {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== "apps.apple.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      !/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?app\/(?:[^/]+\/)?id\d+$/.test(url.pathname)
    )
      return;
    return url.href;
  } catch {
    return;
  }
}

/** Stays undefined until the App Store listing is live and its URL is set at build time. */
export const appStoreUrl = appStoreEntryUrl(import.meta.env.PUBLIC_IOS_APP_STORE_URL);
