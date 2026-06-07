import { inject } from '@angular/core';
import { signalStore, withMethods, withState } from '@ngrx/signals';

import { UserClass } from '../../../shared/models/user.model';
import { AnalyticsService } from '../../analytics/data-access/analytics.service';
import { BillingStore } from '../../billing/store/billing.store';
import {
    MatchActionResponse,
    MatchActionsRepository,
} from '../data-access/match-actions.repository';
import { ProfileStore } from '../../profile/store/profile.store';
import { DailyUsageStore } from '../../usage/store/daily-usage.store';

type DailyAction = 'rewind' | 'super-like';

const initialState = {};
const FREE_DAILY_SUPER_LIKES = 1;
const PREMIUM_DAILY_SUPER_LIKES = 5;

type BillingAccess = {
    isPremium: () => boolean;
    hasEntitlement: (entitlementId: string) => boolean;
    superLikesBalance?: () => number;
};

type DailyUsageAccess = {
    getActionCount: (uid: string | undefined, action: DailyAction) => number;
};

function isPremiumProfile(
    profile?: UserClass | null,
    billingStore?: BillingAccess
) {
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

function getFreeRewindsRemainingForProfile(
    profile?: UserClass | null,
    fallbackUid?: string,
    billingStore?: BillingAccess,
    dailyUsageStore?: DailyUsageAccess
) {
    const uid = profile?.uid ?? fallbackUid;

    if (!uid || isPremiumProfile(profile, billingStore)) {
        return 0;
    }

    return Math.max(1 - (dailyUsageStore?.getActionCount(uid, 'rewind') ?? 0), 0);
}

function applyServerMatchParts(
    profile: UserClass,
    response: MatchActionResponse,
    profileStore: { setProfile: (profile: UserClass) => void }
) {
    if (response.matchParts) {
        profile.matchParts = response.matchParts;
        profileStore.setProfile(profile);
    }

    return response;
}

export const MatchActionsStore = signalStore(
    {
        providedIn: 'root',
    },
    withState(initialState),
    withMethods((
        store,
        profileStore = inject(ProfileStore),
        repository = inject(MatchActionsRepository),
        billingStore = inject(BillingStore),
        dailyUsageStore = inject(DailyUsageStore),
        analytics = inject(AnalyticsService)
    ) => ({
        hasPremiumAccess(profile?: UserClass | null) {
            return isPremiumProfile(profile, billingStore);
        },

        getFreeRewindsRemaining(profile?: UserClass | null, fallbackUid?: string) {
            return getFreeRewindsRemainingForProfile(
                profile,
                fallbackUid,
                billingStore,
                dailyUsageStore
            );
        },

        isRewindLocked(
            profile: UserClass | undefined,
            hasRewindCandidate: boolean,
            fallbackUid?: string
        ) {
            if (!hasRewindCandidate || isPremiumProfile(profile, billingStore)) {
                return false;
            }

            return getFreeRewindsRemainingForProfile(
                profile,
                fallbackUid,
                billingStore,
                dailyUsageStore
            ) <= 0;
        },

        canSuperLike(profile?: UserClass | null, fallbackUid?: string) {
            const uid = profile?.uid ?? fallbackUid;

            if (isPremiumProfile(profile, billingStore) && uid) {
                if (
                    dailyUsageStore.getActionCount(uid, 'super-like') <
                    PREMIUM_DAILY_SUPER_LIKES
                ) {
                    return true;
                }
            }

            if ((billingStore.superLikesBalance?.() ?? 0) > 0) {
                return true;
            }

            if (!uid) {
                return false;
            }

            return (
                dailyUsageStore.getActionCount(uid, 'super-like') <
                FREE_DAILY_SUPER_LIKES
            );
        },

        async likeOrDontUser(
            userProfile: UserClass | undefined,
            matchProfile: UserClass | undefined,
            isLike?: boolean,
            isDontLike?: boolean
        ) {
            if (!userProfile?.uid || !matchProfile?.uid) {
                return false;
            }

            const response = isDontLike
                ? await repository.passUser(matchProfile.uid)
                : await repository.likeUser(matchProfile.uid);

            applyServerMatchParts(userProfile, response, profileStore);
            void analytics.track(
                userProfile.uid,
                isDontLike ? 'match_passed' : 'match_liked',
                { matchUid: matchProfile.uid }
            );

            return response;
        },

        async restoreRewindCandidate(
            userProfile: UserClass | undefined,
            previousMatch: UserClass | undefined
        ) {
            if (!userProfile?.uid || !previousMatch?.uid) {
                return false;
            }

            const response = await repository.rewind(previousMatch.uid);

            applyServerMatchParts(userProfile, response, profileStore);
            void analytics.track(userProfile.uid, 'match_rewind_used', {
                matchUid: previousMatch.uid,
            });

            return response;
        },

        async superLikeUser(
            userProfile: UserClass | undefined,
            matchProfile: UserClass | undefined
        ) {
            if (!userProfile?.uid || !matchProfile?.uid) {
                return false;
            }

            const response = await repository.superLikeUser(matchProfile.uid);

            applyServerMatchParts(userProfile, response, profileStore);
            void analytics.track(userProfile.uid, 'match_super_liked', {
                matchUid: matchProfile.uid,
            });

            return response;
        },
    }))
);
