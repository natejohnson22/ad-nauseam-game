import { defineConfig } from "vitest/config";

export default defineConfig({
  /* Unconditional — NOT gated on process.env.GITHUB_ACTIONS. Settled in issue #5:
     a conditional base means `pnpm dev` serves at a path the deployed build never
     uses, which is exactly how base-path bugs survive to production. The cost is
     that the repo name lives here: renaming the repo means editing this line. */
  base: "/ad-nauseum-game/",
  test: {
    environment: "node",
  },
});
