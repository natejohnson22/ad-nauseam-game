import { Capacitor } from "@capacitor/core";
import { ads } from "./ads";
import { purchases } from "./purchases";

export { ads, purchases };

/** Real SDKs on native; mocked in `pnpm dev` so the revive offer is watchable
    in a browser; entirely absent from the deployed web build, which has no
    ad/IAP SDK to call. */
export function monetizationSupported(): boolean {
  return Capacitor.isNativePlatform() || import.meta.env.DEV;
}

export async function initMonetization(): Promise<void> {
  if (!monetizationSupported()) return;
  await Promise.all([ads.init(), purchases.init()]);
}
