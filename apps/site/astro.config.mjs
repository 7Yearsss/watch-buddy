import { defineConfig } from "astro/config";

// Static site for Cloudflare Pages (docs/design/10). No server code yet: the waitlist goes live with apps/server.
// English at /, other languages at /<code>/ (src/i18n). Set `site` to the real domain once there is one:
// hreflang links and canonical URLs need it to be absolute.
export default defineConfig({
  build: { inlineStylesheets: "auto" },
  i18n: { locales: ["en", "zh", "zh-hant", "ja", "ko", "de", "fr", "es"], defaultLocale: "en", routing: { prefixDefaultLocale: false } },
});
