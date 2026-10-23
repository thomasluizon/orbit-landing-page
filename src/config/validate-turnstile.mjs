import { loadEnv } from "vite";

const { PUBLIC_TURNSTILE_SITE_KEY: siteKey } = loadEnv("production", process.cwd(), "PUBLIC_");

// https://developers.cloudflare.com/api/resources/turnstile/subresources/widgets/methods/create/
if (!siteKey?.trim() || siteKey.length > 32) {
  throw new Error("PUBLIC_TURNSTILE_SITE_KEY must be nonempty and at most 32 characters");
}
