import { createApp } from "./app";
import { d1Store } from "./store";

export interface Env {
  DB: D1Database;
  /** "1" only in .dev.vars for `wrangler dev`: enables CORS for the web prototype and the debug state endpoint. */
  DEV?: string;
  /** wrangler.jsonc "ratelimits": new accounts per IP per minute. */
  ACCOUNTS_LIMITER?: RateLimit;
}

/** One app per Worker instance (bindings don't change within one), so the config cache survives between requests. */
let app: ReturnType<typeof createApp> | null = null;

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const limiter = env.ACCOUNTS_LIMITER;
    app ??= createApp({
      store: d1Store(env.DB),
      dev: env.DEV === "1",
      allowNewAccount: limiter ? async (key) => (await limiter.limit({ key })).success : undefined,
    });
    return app.fetch(req, env, ctx);
  },
} satisfies ExportedHandler<Env>;
