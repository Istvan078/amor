import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';

import { Promotions } from '../../../shared/models/promotions.model';
import { AnalyticsService } from '../../analytics/data-access/analytics.service';
import { PaywallComponent } from '../../billing/ui/paywall/paywall.component';
import { BillingStore } from '../../billing/store/billing.store';
import { MatchIndexRepository } from '../../matching/data-access/match-index.repository';
import { DailyUsageAction } from '../../usage/data-access/daily-usage.repository';
import { DailyUsageStore } from '../../usage/store/daily-usage.store';

const FREE_DAILY_LIKE_LIMIT = 30;
const FIRST_MONTH_DAILY_LIKE_LIMIT = 60;
const FIRST_MONTH_PRODUCT_ID = 'amorino_gold_first_month';

@Injectable({
  providedIn: 'root',
})
export class BillingFacade {
  readonly store = inject(BillingStore);

  private analytics = inject(AnalyticsService);
  private dailyUsageStore = inject(DailyUsageStore);
  private matchIndexRepository = inject(MatchIndexRepository);
  private modalCtrl = inject(ModalController);

  clearDailyUsage() {
    this.dailyUsageStore.clearDailyUsage();
  }

  loadDailyUsage(uid: string, force = false) {
    return this.dailyUsageStore.loadDailyUsage(uid, force);
  }

  incrementDailyUsage(uid: string, action: DailyUsageAction) {
    return this.dailyUsageStore.incrementDailyUsage(uid, action);
  }

  async canUseDailyLike(uid: string, likeLimit: number) {
    if (!Number.isFinite(likeLimit)) {
      return true;
    }

    await this.dailyUsageStore.loadDailyUsage(uid);

    return this.dailyUsageStore.getActionCount(uid, 'like') < likeLimit;
  }

  getDailyLikeLimit() {
    if (this.isFirstMonthPremiumActive()) {
      return FIRST_MONTH_DAILY_LIKE_LIMIT;
    }

    if (this.store.isPremium()) {
      return Number.POSITIVE_INFINITY;
    }

    return FREE_DAILY_LIKE_LIMIT;
  }

  isFirstMonthPremiumActive() {
    const billing = this.store.current();
    const productIds = [
      billing?.productId,
      ...(billing?.activeSubscriptions ?? []),
    ].filter((productId): productId is string => !!productId);

    return productIds.some(
      (productId) =>
        productId === FIRST_MONTH_PRODUCT_ID ||
        productId.includes('first_month')
    );
  }

  async loadActiveProfileBoost(uid: string) {
    try {
      return await this.matchIndexRepository.getProfileBoostedUntil(uid);
    } catch (error) {
      console.warn('Failed to load profile boost state.', error);
      return null;
    }
  }

  async activateProfileBoost(uid: string) {
    try {
      const boostedUntil = await this.matchIndexRepository.activateProfileBoost(uid);

      await this.store.refreshCustomerInfo(uid);
      await this.dailyUsageStore.incrementDailyUsage(uid, 'boost');
      void this.analytics.track(uid, 'boost_started', {
        boostedUntil: boostedUntil.toISOString(),
        durationMinutes: 30,
      });

      return boostedUntil;
    } catch (error) {
      console.warn('Failed to activate profile boost.', error);
      return null;
    }
  }

  async openPaywall(uid?: string | null, promotion?: Promotions) {
    void this.analytics.track(uid, 'paywall_opened', {
      promotionId: promotion?.['id'] ?? null,
    });

    const modal = await this.modalCtrl.create({
      component: PaywallComponent,
      componentProps: {
        promotionId: promotion?.['id'],
      },
      cssClass: 'paywall-modal',
    });

    await modal.present();

    const { data } = await modal.onDidDismiss<{
      purchased?: boolean;
      restored?: boolean;
    }>();

    return data ?? {};
  }

  profileBoostMinutesLeft(profileBoostedUntil: unknown, now: number) {
    const remainingMs = this.getProfileBoostExpiresAtMillis(profileBoostedUntil) - now;

    if (remainingMs <= 0) {
      return 0;
    }

    return Math.max(Math.ceil(remainingMs / 60000), 1);
  }

  isProfileBoostActive(profileBoostedUntil: unknown, now: number) {
    return this.getProfileBoostExpiresAtMillis(profileBoostedUntil) > now;
  }

  getProfileBoostExpiresAtMillis(profileBoostedUntil: unknown) {
    return this.toTimestampMillis(profileBoostedUntil);
  }

  private toTimestampMillis(value: unknown) {
    if (!value) {
      return 0;
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const date = new Date(value);

      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    }

    if (typeof value === 'object') {
      const maybeTimestamp = value as {
        toDate?: () => Date;
        toMillis?: () => number;
      };

      if (typeof maybeTimestamp.toMillis === 'function') {
        return maybeTimestamp.toMillis();
      }

      if (typeof maybeTimestamp.toDate === 'function') {
        return maybeTimestamp.toDate().getTime();
      }
    }

    return 0;
  }
}
