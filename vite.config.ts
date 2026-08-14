import { defineConfig } from "vitest/config";

export default defineConfig({
  /* Unconditional — NOT gated on process.env.GITHUB_ACTIONS. Settled in issue #5:
     a conditional base means `pnpm dev` serves at a path the deployed build never
     uses, which is exactly how base-path bugs survive to production. The cost is
     that the repo name lives here: renaming the repo means editing this line.

     The one exception is the Capacitor build: a webview serves from its own
     root, so `pnpm build:native` passes `--base=./` on the CLI. That is a
     separate script producing a separate artifact, not a branch inside dev. */
  base: "/ad-nauseam-game/",
  test: {
    environment: "node",
  },
});
