import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.natejohnson.adnauseum",
  appName: "Ad Nauseum",
  /* Same `dist/` that GitHub Pages deploys — but it has to be built with
     `pnpm build:native`, not `pnpm build`. The Pages build hardcodes
     base: "/ad-nauseam-game/" (see vite.config.ts), and a webview serving
     from its own root would 404 on every one of those asset URLs.
     `build:native` overrides base to "./" for exactly this reason. */
  webDir: "dist",
  server: {
    // Landscape game in a webview: no bounce, no rubber-banding.
    iosScheme: "capacitor",
  },
  ios: {
    contentInset: "never",
  },
};

export default config;
