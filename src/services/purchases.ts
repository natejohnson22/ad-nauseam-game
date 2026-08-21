import { Capacitor } from "@capacitor/core";
import {
  Purchases,
  PRODUCT_CATEGORY,
  PURCHASES_ERROR_CODE,
  type PurchasesError,
} from "@revenuecat/purchases-capacitor";
import { REVENUECAT_API_KEY, REVIVE_PRODUCT_ID } from "./monetization-config";

export interface PurchasesService {
  init(): Promise<void>;
  /** Resolves `true` on a completed purchase, `false` if the user cancelled
      or the store/SDK failed. Never rejects — a thrown error would leave the
      continue overlay's buttons disabled. */
  buyRevive(): Promise<boolean>;
}

function apiKey(): string {
  return Capacitor.getPlatform() === "ios"
    ? REVENUECAT_API_KEY.ios
    : REVENUECAT_API_KEY.android;
}

function isCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as PurchasesError).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  );
}

class NativePurchasesService implements PurchasesService {
  async init(): Promise<void> {
    await Purchases.configure({ apiKey: apiKey() });
  }

  async buyRevive(): Promise<boolean> {
    try {
      const { products } = await Purchases.getProducts({
        productIdentifiers: [REVIVE_PRODUCT_ID],
        type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
      });
      const product = products[0];
      if (!product) return false;

      await Purchases.purchaseStoreProduct({ product });
      return true;
    } catch (error) {
      if (isCancelled(error)) return false;
      // Missing product, store outage, SDK misconfig — treat as a failed
      // attempt, not an unhandled rejection. The overlay re-enables Buy /
      // No Thanks so the player is not stuck on a dead continue prompt.
      console.warn("[purchases] revive buy failed", error);
      return false;
    }
  }
}

class MockPurchasesService implements PurchasesService {
  async init(): Promise<void> {
    console.info("[purchases] mock service ready (dev, non-native)");
  }

  async buyRevive(): Promise<boolean> {
    console.info("[purchases] mock revive purchase completed");
    await new Promise((resolve) => setTimeout(resolve, 400));
    return true;
  }
}

class DisabledPurchasesService implements PurchasesService {
  async init(): Promise<void> {}

  async buyRevive(): Promise<boolean> {
    return false;
  }
}

/** Native SDK on device, a mock on `pnpm dev` so the revive flow is watchable
    in a browser, disabled outright on the deployed web build. */
export const purchases: PurchasesService = Capacitor.isNativePlatform()
  ? new NativePurchasesService()
  : import.meta.env.DEV
    ? new MockPurchasesService()
    : new DisabledPurchasesService();
