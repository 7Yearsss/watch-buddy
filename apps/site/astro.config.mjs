import { defineConfig } from "astro/config";

// Static site for Cloudflare Pages (docs/design/10). No server code yet: the waitlist goes live with apps/server.
export default defineConfig({
  build: { inlineStylesheets: "auto" },
});
