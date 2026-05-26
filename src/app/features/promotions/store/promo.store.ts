import { inject } from '@angular/core';
import { signalStore, withMethods, withState } from '@ngrx/signals';

import { Promotions } from '../../../shared/models/promotions.model';
import { UserClass } from '../../../shared/models/user.model';
import { BillingStore } from '../../billing/store/billing.store';
import {
    PromoPreferencesRepository,
    PromoSheetState,
} from '../data-access/promo-preferences.repository';

type PromoDecisionInput = {
    uid?: string | null;
    phoneView: boolean;
    promotions: Promotions[];
    isOpen: boolean;
    loadedDiscoverUid?: string | null;
    alreadyShownForUid?: string | null;
    userProfile?: UserClass;
    possibleMatchIds: string[];
    matches: UserClass[];
    isMatchPlaceHolder: boolean;
};

type PromoDecision = {
    promotions: Promotions[];
    activeIndex: number;
};

const initialState = {};

const promoClosedCooldownMs = 24 * 60 * 60 * 1000;
const promoMaybeLaterCooldownMs = 12 * 60 * 60 * 1000;
const promoFirstDayMs = 24 * 60 * 60 * 1000;

function todayKey(date = new Date()) {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
}

type BillingAccess = {
    isPremium: () => boolean;
    hasEntitlement: (entitlementId: string) => boolean;
};

function isPremiumUser(profile?: UserClass, billingStore?: BillingAccess) {
    if (
        billingStore?.isPremium() ||
        billingStore?.hasEntitlement('premium')
    ) {
        return true;
    }

    const subscriptions = profile?.subscriptions;

    return !!(
        subscriptions?.gold ||
        subscriptions?.silver ||
        subscriptions?.bronze
    );
}

function uniquePromoIds(ids: string[]) {
    return [...new Set(ids)];
}

function getHiddenLikesCount(profile?: UserClass) {
    const profileRecord = profile as Record<string, unknown> | undefined;
    const hiddenLikeKeys = [
        'hiddenLikes',
        'likedBy',
        'likesReceived',
        'receivedLikes',
        'profileLikes',
    ];

    if (!profileRecord) {
        return 0;
    }

    for (const key of hiddenLikeKeys) {
        const value = profileRecord[key];

        if (Array.isArray(value)) {
            return value.length;
        }

        if (typeof value === 'number') {
            return value;
        }

        if (value && typeof value === 'object' && 'count' in value) {
            const count = (value as { count?: unknown }).count;

            if (typeof count === 'number') {
                return count;
            }
        }
    }

    return 0;
}

function canShowPromoBottomSheet(
    state: PromoSheetState,
    isFirstDay: boolean,
    now: number
) {
    const dailyLimit = isFirstDay ? 2 : 1;
    const todaysShows = state.dailyShows[todayKey()] ?? 0;

    if (todaysShows >= dailyLimit) {
        return false;
    }

    if (state.lastClosedAt && now - state.lastClosedAt < promoClosedCooldownMs) {
        return false;
    }

    if (
        state.lastMaybeLaterAt &&
        now - state.lastMaybeLaterAt < promoMaybeLaterCooldownMs
    ) {
        return false;
    }

    return true;
}

function preferPromosNotShownToday(
    promotions: Promotions[],
    state: PromoSheetState
) {
    const currentTodayKey = todayKey();
    const shownToday = new Set(
        Object.entries(state.shownTriggers ?? {})
            .filter(([, shownAt]) => todayKey(new Date(shownAt)) === currentTodayKey)
            .map(([id]) => id)
    );
    const freshPromotions = promotions.filter(
        (promotion) => !shownToday.has(String(promotion['id']))
    );

    return freshPromotions.length ? freshPromotions : promotions;
}

function getPromoBottomSheetCandidates(
    input: PromoDecisionInput,
    state: PromoSheetState,
    isFirstDay: boolean
) {
    const orderedIds: string[] = [];
    const likedCount = input.userProfile?.matchParts?.liked?.length ?? 0;
    const notLikedCount = input.userProfile?.matchParts?.notLiked?.length ?? 0;
    const hiddenLikesCount = getHiddenLikesCount(input.userProfile);
    const possibleCount = input.possibleMatchIds.length;
    const matchCount = input.matches.length;

    if (isFirstDay) {
        orderedIds.push('firstMonth');
    }

    if (hiddenLikesCount > 0) {
        orderedIds.push('seeLikes');
    }

    if (likedCount >= 8 || (likedCount >= 3 && possibleCount <= 1)) {
        orderedIds.push('amorinoGold');
    }

    if ((matchCount <= 1 && possibleCount <= 2) || input.isMatchPlaceHolder) {
        orderedIds.push('profileBoost');
    }

    if (likedCount + notLikedCount >= 8 && notLikedCount >= likedCount) {
        orderedIds.push('superLike');
    }

    orderedIds.push(
        'amorinoGold',
        'profileBoost',
        'seeLikes',
        'superLike',
        'firstMonth'
    );

    const candidates = uniquePromoIds(orderedIds)
        .map((id) => input.promotions.find((promotion) => promotion['id'] === id))
        .filter((promotion): promotion is Promotions => !!promotion);

    return preferPromosNotShownToday(candidates, state).slice(0, 3);
}

function markPromoBottomSheetShown(
    state: PromoSheetState,
    promoId?: string
) {
    const currentTodayKey = todayKey();
    const now = Date.now();

    state.dailyShows[currentTodayKey] =
        (state.dailyShows[currentTodayKey] ?? 0) + 1;
    state.shownTriggers ??= {};

    if (promoId) {
        state.shownTriggers[promoId] = now;
    }
}

export const PromoStore = signalStore(
    {
        providedIn: 'root',
    },
    withState(initialState),
    withMethods((
        store,
        repository = inject(PromoPreferencesRepository),
        billingStore = inject(BillingStore)
    ) => ({
        getBottomSheetDecision(input: PromoDecisionInput): PromoDecision | null {
            const uid = input.uid;

            if (
                !uid ||
                !input.phoneView ||
                !input.promotions.length ||
                input.isOpen ||
                input.loadedDiscoverUid !== uid ||
                input.alreadyShownForUid === uid ||
                isPremiumUser(input.userProfile, billingStore)
            ) {
                return null;
            }

            const now = Date.now();
            const state = repository.readPromoSheetState(uid);
            const isFirstDay = now - state.firstSeenAt < promoFirstDayMs;

            if (!canShowPromoBottomSheet(state, isFirstDay, now)) {
                repository.writePromoSheetState(uid, state);
                return null;
            }

            const candidates = getPromoBottomSheetCandidates(
                input,
                state,
                isFirstDay
            );

            if (!candidates.length) {
                return null;
            }

            markPromoBottomSheetShown(state, candidates[0]?.['id']);
            repository.writePromoSheetState(uid, state);

            return {
                promotions: candidates,
                activeIndex: 0,
            };
        },

        recordDismiss(uid: string, reason: 'close' | 'maybeLater' | 'cta') {
            const state = repository.readPromoSheetState(uid);
            const now = Date.now();

            if (reason === 'maybeLater') {
                state.lastMaybeLaterAt = now;
            } else {
                state.lastClosedAt = now;
            }

            repository.writePromoSheetState(uid, state);
        },
    }))
);
