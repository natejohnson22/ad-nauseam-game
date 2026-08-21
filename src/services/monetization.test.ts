import { afterEach, describe, expect, it, vi } from "vitest";

// `ads.ts`/`purchases.ts` import the real AdMob/RevenueCat packages, which
// call `registerPlugin` from `@capacitor/core` at module load — stub the
// whole module so importing them here doesn't require a native runtime.
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => "web"),
  },
  registerPlugin: vi.fn(() => ({})),
}));

import { Capacitor } from "@capacitor/core";
import { monetizationSupported } from "./monetization";

/**
 * The one rule keeping AdMob/RevenueCat off the deployed web build: real SDKs
 * on native, mocked services in `pnpm dev`, nothing on the shipped web build.
 */
describe("monetizationSupported", () => {
  const originalDev = import.meta.env.DEV;

  afterEach(() => {
    import.meta.env.DEV = originalDev;
  });

  it("is supported on native, regardless of DEV", () => {
    import.meta.env.DEV = false;
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    expect(monetizationSupported()).toBe(true);
  });

  it("is supported off native in dev mode, so the offer is watchable in pnpm dev", () => {
    import.meta.env.DEV = true;
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    expect(monetizationSupported()).toBe(true);
  });

  it("is unsupported on the deployed web build — neither native nor dev", () => {
    import.meta.env.DEV = false;
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    expect(monetizationSupported()).toBe(false);
  });
});
