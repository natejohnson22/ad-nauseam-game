import { Capacitor } from "@capacitor/core";
import {
  AdMob,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from "@capacitor-community/admob";
import {
  ADMOB_INTERSTITIAL_AD_UNIT_ID,
  ADMOB_REWARDED_AD_UNIT_ID,
} from "./monetization-config";

export interface AdsService {
  init(): Promise<void>;
  /** Resolves `true` only if the player watched the ad through to the reward. */
  showRewarded(): Promise<boolean>;
  /** Resolves once the ad is gone — dismissed, or never shown at all because
      it failed to load. Never rejects: a missing fill must not block the
      player from continuing past the death screen. */
  showInterstitial(): Promise<void>;
}

function rewardedAdUnitId(): string {
  return Capacitor.getPlatform() === "ios"
    ? ADMOB_REWARDED_AD_UNIT_ID.ios
    : ADMOB_REWARDED_AD_UNIT_ID.android;
}

function interstitialAdUnitId(): string {
  return Capacitor.getPlatform() === "ios"
    ? ADMOB_INTERSTITIAL_AD_UNIT_ID.ios
    : ADMOB_INTERSTITIAL_AD_UNIT_ID.android;
}

class NativeAdsService implements AdsService {
  async init(): Promise<void> {
    await AdMob.initialize({ initializeForTesting: import.meta.env.DEV });
    // Android and pre-14.5 iOS no-op this; declared in Info.plist alongside
    // the ATT usage string it requires.
    if (Capacitor.getPlatform() === "ios") {
      await AdMob.requestTrackingAuthorization();
    }
  }

  async showRewarded(): Promise<boolean> {
    await AdMob.prepareRewardVideoAd({
      adId: rewardedAdUnitId(),
      isTesting: import.meta.env.DEV,
    });

    // `showRewardVideoAd` only resolves once a reward is earned, so closing
    // the ad early would leave it pending forever — race it against
    // `Dismissed`, which fires once the ad session ends either way.
    return new Promise<boolean>((resolve) => {
      let rewarded = false;
      const rewardedHandle = AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
        rewarded = true;
      });
      const dismissedHandle = AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        resolve(rewarded);
        void rewardedHandle.then((handle) => handle.remove());
        void dismissedHandle.then((handle) => handle.remove());
      });
      void AdMob.showRewardVideoAd().catch(() => resolve(false));
    });
  }

  async showInterstitial(): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      let dismissedHandle: ReturnType<typeof AdMob.addListener> | null = null;
      let failedToShowHandle: ReturnType<typeof AdMob.addListener> | null = null;
      const settle = (): void => {
        if (settled) return;
        settled = true;
        resolve();
        void dismissedHandle?.then((handle) => handle.remove());
        void failedToShowHandle?.then((handle) => handle.remove());
      };

      dismissedHandle = AdMob.addListener(InterstitialAdPluginEvents.Dismissed, settle);
      failedToShowHandle = AdMob.addListener(
        InterstitialAdPluginEvents.FailedToShow,
        settle,
      );
      AdMob.prepareInterstitial({
        adId: interstitialAdUnitId(),
        isTesting: import.meta.env.DEV,
      })
        .then(() => AdMob.showInterstitial())
        .catch(settle); // no fill / load error — move on rather than stall
    });
  }
}

class MockAdsService implements AdsService {
  async init(): Promise<void> {
    console.info("[ads] mock service ready (dev, non-native)");
  }

  async showRewarded(): Promise<boolean> {
    console.info("[ads] mock rewarded ad watched");
    await new Promise((resolve) => setTimeout(resolve, 400));
    return true;
  }

  async showInterstitial(): Promise<void> {
    console.info("[ads] mock interstitial shown");
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}

class DisabledAdsService implements AdsService {
  async init(): Promise<void> {}

  async showRewarded(): Promise<boolean> {
    return false;
  }

  async showInterstitial(): Promise<void> {}
}

/** Native SDK on device, a mock on `pnpm dev` so the revive flow is watchable
    in a browser, disabled outright on the deployed web build. */
export const ads: AdsService = Capacitor.isNativePlatform()
  ? new NativeAdsService()
  : import.meta.env.DEV
    ? new MockAdsService()
    : new DisabledAdsService();
