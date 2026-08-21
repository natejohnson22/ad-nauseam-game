/**
 * AdMob/RevenueCat identifiers. These are public, client-embedded IDs — not
 * secrets — so a plain constants file is the right place for them, same as
 * `capacitor.config.ts`'s `appId`.
 *
 * Every value below is a placeholder: Google's published AdMob test IDs
 * (real ads, never billed, always fill) and unconfigured RevenueCat/App
 * Store identifiers. Swap the `TODO(real ID)` values once the dashboards
 * exist — nothing else in the monetization code needs to change.
 */

export const ADMOB_APP_ID = {
  ios: "ca-app-pub-3940256099942544~1458002511", // TODO(real ID): AdMob iOS app ID
  android: "ca-app-pub-3940256099942544~3347511713", // TODO(real ID): AdMob Android app ID
} as const;

export const ADMOB_REWARDED_AD_UNIT_ID = {
  ios: "ca-app-pub-3940256099942544/1712485313", // TODO(real ID): rewarded ad unit, iOS
  android: "ca-app-pub-3940256099942544/5224354917", // TODO(real ID): rewarded ad unit, Android
} as const;

/** Shown in place of the joke placeholder on death/timeout, native only. */
export const ADMOB_INTERSTITIAL_AD_UNIT_ID = {
  ios: "ca-app-pub-3940256099942544/4411468910", // TODO(real ID): interstitial ad unit, iOS
  android: "ca-app-pub-3940256099942544/1033173712", // TODO(real ID): interstitial ad unit, Android
} as const;

export const REVENUECAT_API_KEY = {
  ios: "appl_TODO_REPLACE_WITH_REAL_KEY", // TODO(real ID): RevenueCat public SDK key, iOS
  android: "goog_TODO_REPLACE_WITH_REAL_KEY", // TODO(real ID): RevenueCat public SDK key, Android
} as const;

/** The one consumable product this game sells today (issue: AdMob+RevenueCat
    revive) — bought fresh every time the player wants to continue, no
    balance carried between deaths. Must match the identifier configured in
    App Store Connect / Play Console and imported into the RevenueCat
    dashboard. */
export const REVIVE_PRODUCT_ID = "com.natejohnson.adnauseum.revive"; // TODO(real ID): once the store listing exists
