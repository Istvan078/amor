import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  Purchases,
  type CustomerInfo,
  type PurchasesPackage,
} from '@revenuecat/purchases-capacitor';
import {
  Firestore,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';

import { environment } from '../../../../environments/environment';

export type BillingPlatform = 'ios' | 'android' | 'web';
export type BillingProductKind = 'subscription' | 'consumable';

export type BillingPackage = {
  id: string;
  promotionId: string;
  productId: string;
  packageIdentifier?: string;
  titleKey: string;
  descriptionKey: string;
  priceLabel: string;
  featureKeys: string[];
  kind: BillingProductKind;
  entitlementId?: string;
  isFeatured?: boolean;
};

export type BillingCurrent = {
  isPremium: boolean;
  entitlement: string | null;
  productId: string | null;
  platform: BillingPlatform;
  expiresAt: string | null;
  activeEntitlements: string[];
  activeSubscriptions: string[];
  source: 'revenuecat' | 'cache' | 'local';
};

@Injectable({
  providedIn: 'root',
})
export class BillingRepository {
  private injector = inject(Injector);
  private firestore = inject(Firestore);
  private configuredUid: string | null = null;
  private configured = false;
  private packageCache = new Map<string, PurchasesPackage>();

  get entitlementId() {
    return environment.billing.entitlementId;
  }

  getConfiguredPackages(): BillingPackage[] {
    return environment.billing.packages.map((billingPackage) => ({
      ...billingPackage,
      kind: billingPackage.kind as BillingProductKind,
    }));
  }

  async configure(uid: string) {
    if (this.configured && this.configuredUid === uid) {
      return true;
    }

    const platform = this.getPlatform();
    const apiKey = this.getRevenueCatApiKey(platform);

    if (!apiKey) {
      this.configured = false;
      this.configuredUid = uid;
      return false;
    }

    if (platform === 'web' && environment.billing.revenueCat.webMockResults) {
      await Purchases.setMockWebResults({ shouldMockWebResults: true });
    }

    await Purchases.configure({
      apiKey,
      appUserID: uid,
      shouldShowInAppMessagesAutomatically: true,
    });

    this.configured = true;
    this.configuredUid = uid;

    return true;
  }

  async getOfferings(): Promise<BillingPackage[]> {
    if (!this.configured) {
      return this.getConfiguredPackages();
    }

    const offerings = await Purchases.getOfferings();
    const revenueCatPackages = offerings.current?.availablePackages ?? [];

    this.packageCache.clear();

    if (!revenueCatPackages.length) {
      return this.getConfiguredPackages();
    }

    return revenueCatPackages.map((revenueCatPackage) =>
      this.mapRevenueCatPackage(revenueCatPackage)
    );
  }

  async purchasePackage(uid: string, packageId: string) {
    if (!this.configured) {
      if (this.canUseWebMock()) {
        return this.createMockPurchase(uid, packageId);
      }

      throw new Error('billing.errors.notConfigured');
    }

    const packageToBuy = this.packageCache.get(packageId);

    if (!packageToBuy) {
      if (this.canUseWebMock()) {
        return this.createMockPurchase(uid, packageId);
      }

      throw new Error('billing.errors.packageUnavailable');
    }

    const result = await Purchases.purchasePackage({
      aPackage: packageToBuy,
    });

    const current = await this.cacheCustomerInfo(uid, result.customerInfo);

    return {
      customerInfo: result.customerInfo,
      current,
    };
  }

  async restorePurchases(uid: string) {
    if (!this.configured) {
      if (this.canUseWebMock()) {
        const current = await this.getCachedBilling(uid);

        return {
          customerInfo: null,
          current,
        };
      }

      throw new Error('billing.errors.notConfigured');
    }

    const result = await Purchases.restorePurchases();
    const current = await this.cacheCustomerInfo(uid, result.customerInfo);

    return {
      customerInfo: result.customerInfo,
      current,
    };
  }

  async getCustomerInfo(uid: string) {
    if (!this.configured) {
      const cached = await this.getCachedBilling(uid);

      return {
        customerInfo: null,
        current: cached,
      };
    }

    const result = await Purchases.getCustomerInfo();
    const current = await this.cacheCustomerInfo(uid, result.customerInfo);

    return {
      customerInfo: result.customerInfo,
      current,
    };
  }

  async getCachedBilling(uid: string): Promise<BillingCurrent> {
    const snapshot = await this.runInFirebaseContext(() => {
      const billingRef = doc(this.firestore, `users/${uid}/billing/current`);

      return getDoc(billingRef);
    });

    if (!snapshot.exists()) {
      return this.emptyBillingCurrent('cache');
    }

    const data = snapshot.data() as Partial<BillingCurrent>;
    const current = {
      ...this.emptyBillingCurrent('cache'),
      ...data,
      source: data.source ?? 'cache',
    };

    return this.resolveCachedBillingCurrent(current);
  }

  async cacheCustomerInfo(uid: string, customerInfo: CustomerInfo) {
    const current = this.mapCustomerInfo(customerInfo);

    await this.cacheBillingCurrent(uid, current);

    return current;
  }

  async cacheBillingCurrent(uid: string, current: BillingCurrent) {
    await this.runInFirebaseContext(() => {
      const billingRef = doc(this.firestore, `users/${uid}/billing/current`);

      return setDoc(
        billingRef,
        {
          ...current,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    return current;
  }

  isPurchaseCancelled(error: unknown) {
    const purchaseError = error as {
      userCancelled?: boolean;
      code?: string;
    };

    return (
      purchaseError?.userCancelled === true ||
      purchaseError?.code === 'PURCHASE_CANCELLED' ||
      purchaseError?.code === 'USER_CANCELLED'
    );
  }

  private mapRevenueCatPackage(revenueCatPackage: PurchasesPackage): BillingPackage {
    const configuredPackage = this.getConfiguredPackages().find(
      (billingPackage) =>
        billingPackage.productId === revenueCatPackage.product.identifier ||
        billingPackage.packageIdentifier === revenueCatPackage.identifier ||
        billingPackage.id === revenueCatPackage.identifier
    );

    const packageId = configuredPackage?.id ?? revenueCatPackage.identifier;
    this.packageCache.set(packageId, revenueCatPackage);

    return {
      id: packageId,
      promotionId: configuredPackage?.promotionId ?? packageId,
      productId: revenueCatPackage.product.identifier,
      packageIdentifier: revenueCatPackage.identifier,
      titleKey: configuredPackage?.titleKey ?? 'billing.packages.default.title',
      descriptionKey:
        configuredPackage?.descriptionKey ?? 'billing.packages.default.description',
      priceLabel: revenueCatPackage.product.priceString,
      featureKeys: configuredPackage?.featureKeys ?? [],
      kind: configuredPackage?.kind ?? 'subscription',
      entitlementId: configuredPackage?.entitlementId,
      isFeatured: configuredPackage?.isFeatured,
    };
  }

  private mapCustomerInfo(customerInfo: CustomerInfo): BillingCurrent {
    const activeEntitlements = Object.keys(customerInfo.entitlements.active ?? {});
    const entitlement = activeEntitlements.includes(this.entitlementId)
      ? this.entitlementId
      : activeEntitlements[0] ?? null;

    return {
      isPremium: activeEntitlements.includes(this.entitlementId),
      entitlement,
      productId: customerInfo.activeSubscriptions[0] ?? null,
      platform: this.getPlatform(),
      expiresAt: customerInfo.latestExpirationDate,
      activeEntitlements,
      activeSubscriptions: customerInfo.activeSubscriptions,
      source: 'revenuecat',
    };
  }

  private emptyBillingCurrent(source: BillingCurrent['source']): BillingCurrent {
    return {
      isPremium: false,
      entitlement: null,
      productId: null,
      platform: this.getPlatform(),
      expiresAt: null,
      activeEntitlements: [],
      activeSubscriptions: [],
      source,
    };
  }

  private resolveCachedBillingCurrent(current: BillingCurrent): BillingCurrent {
    if (!current.isPremium || !current.expiresAt) {
      return current;
    }

    const expiresAtMs = Date.parse(current.expiresAt);

    if (Number.isNaN(expiresAtMs) || expiresAtMs > Date.now()) {
      return current;
    }

    return {
      ...current,
      isPremium: false,
      entitlement: null,
      activeEntitlements: [],
      activeSubscriptions: [],
    };
  }

  private async createMockPurchase(uid: string, packageId: string) {
    const billingPackage = this.getConfiguredPackages().find(
      (configuredPackage) => configuredPackage.id === packageId
    );

    if (!billingPackage) {
      throw new Error('billing.errors.packageUnavailable');
    }

    const current = billingPackage.entitlementId
      ? this.createMockPremiumCurrent(billingPackage)
      : await this.getCachedBilling(uid);

    await this.cacheBillingCurrent(uid, current);

    return {
      customerInfo: null,
      current,
    };
  }

  private createMockPremiumCurrent(billingPackage: BillingPackage): BillingCurrent {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return {
      isPremium: billingPackage.entitlementId === this.entitlementId,
      entitlement: billingPackage.entitlementId ?? null,
      productId: billingPackage.productId,
      platform: this.getPlatform(),
      expiresAt: expiresAt.toISOString(),
      activeEntitlements: billingPackage.entitlementId
        ? [billingPackage.entitlementId]
        : [],
      activeSubscriptions:
        billingPackage.kind === 'subscription' ? [billingPackage.productId] : [],
      source: 'local',
    };
  }

  private canUseWebMock() {
    return (
      this.getPlatform() === 'web' &&
      environment.billing.revenueCat.webMockResults &&
      !environment.production
    );
  }

  private getRevenueCatApiKey(platform: BillingPlatform) {
    if (platform === 'ios') {
      return environment.billing.revenueCat.iosApiKey;
    }

    if (platform === 'android') {
      return environment.billing.revenueCat.androidApiKey;
    }

    return environment.billing.revenueCat.webApiKey;
  }

  private getPlatform(): BillingPlatform {
    const platform = Capacitor.getPlatform();

    if (platform === 'ios' || platform === 'android') {
      return platform;
    }

    return 'web';
  }

  private runInFirebaseContext<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }
}
