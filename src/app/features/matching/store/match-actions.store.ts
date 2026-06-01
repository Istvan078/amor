import { inject } from '@angular/core';
import { signalStore, withMethods, withState } from '@ngrx/signals';

import { MatchParts, UserClass } from '../../../shared/models/user.model';
import { BillingStore } from '../../billing/store/billing.store';
import { ProfileStore } from '../../profile/store/profile.store';
import { DailyUsageStore } from '../../usage/store/daily-usage.store';

type DailyAction = 'rewind' | 'super-like';

const initialState = {};
const FREE_DAILY_SUPER_LIKES = 1;
const PREMIUM_DAILY_SUPER_LIKES = 5;

function ensureMatchParts(profile: UserClass) {
    profile.matchParts ??= new MatchParts();
    profile.matchParts.matches ??= [];
    profile.matchParts.possMatches ??= [];
    profile.matchParts.liked ??= [];
    profile.matchParts.notLiked ??= [];
    profile.matchParts.superLiked ??= [];

    return profile.matchParts;
}

type BillingAccess = {
    isPremium: () => boolean;
    hasEntitlement: (entitlementId: string) => boolean;
    superLikesBalance?: () => number;
    consumeSuperLike?: () => Promise<boolean>;
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

export const MatchActionsStore = signalStore(
    {
        providedIn: 'root',
    },
    withState(initialState),
    withMethods((
        store,
        profileStore = inject(ProfileStore),
        billingStore = inject(BillingStore),
        dailyUsageStore = inject(DailyUsageStore)
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

        async consumeDailyAction(
            profile: UserClass | undefined,
            action: DailyAction,
            fallbackUid?: string
        ) {
            const uid = profile?.uid ?? fallbackUid;

            if (!uid) {
                return;
            }

            await dailyUsageStore.loadDailyUsage(uid);

            const isPremium = isPremiumProfile(profile, billingStore);

            if (action === 'rewind' && isPremium) {
                return;
            }

            if (action === 'super-like') {
                if (
                    isPremium &&
                    dailyUsageStore.getActionCount(uid, 'super-like') <
                    PREMIUM_DAILY_SUPER_LIKES
                ) {
                    await dailyUsageStore.incrementDailyUsage(uid, action);
                    return;
                }

                if ((billingStore.superLikesBalance?.() ?? 0) > 0) {
                    void billingStore.consumeSuperLike?.();
                    return;
                }

                if (isPremium) {
                    return;
                }
            }

            await dailyUsageStore.incrementDailyUsage(uid, action);
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

            const matchParts = ensureMatchParts(userProfile);

            if (isLike && !matchParts.liked.includes(matchProfile.uid)) {
                matchParts.liked.push(matchProfile.uid);
            }

            if (isDontLike && !matchParts.notLiked.includes(matchProfile.uid)) {
                matchParts.notLiked.push(matchProfile.uid);
            }

            if (matchParts.possMatches.includes(matchProfile.uid)) {
                matchParts.possMatches = matchParts.possMatches.filter(
                    (uid) => uid !== matchProfile.uid
                );
            }

            await profileStore.updateProfile(
                userProfile.uid,
                userProfile.setDataForFireStore()
            );
            profileStore.setProfile(userProfile);

            return true;
        },

        async restoreRewindCandidate(
            userProfile: UserClass | undefined,
            previousMatch: UserClass | undefined
        ) {
            if (!userProfile?.uid || !previousMatch?.uid) {
                return false;
            }

            const matchParts = ensureMatchParts(userProfile);

            matchParts.notLiked = matchParts.notLiked.filter(
                (uid) => uid !== previousMatch.uid
            );

            if (
                !matchParts.possMatches.includes(previousMatch.uid) &&
                !matchParts.liked.includes(previousMatch.uid)
            ) {
                matchParts.possMatches.push(previousMatch.uid);
            }

            await profileStore.updateProfile(
                userProfile.uid,
                userProfile.setDataForFireStore()
            );
            profileStore.setProfile(userProfile);

            return true;
        },

        async superLikeUser(
            userProfile: UserClass | undefined,
            matchProfile: UserClass | undefined
        ) {
            if (!userProfile?.uid || !matchProfile?.uid) {
                return false;
            }

            const matchParts = ensureMatchParts(userProfile);

            if (!matchParts.superLiked.includes(matchProfile.uid)) {
                matchParts.superLiked.push(matchProfile.uid);
            }

            if (!matchParts.liked.includes(matchProfile.uid)) {
                matchParts.liked.push(matchProfile.uid);
            }

            if (matchParts.possMatches.includes(matchProfile.uid)) {
                matchParts.possMatches = matchParts.possMatches.filter(
                    (uid) => uid !== matchProfile.uid
                );
            }

            await profileStore.updateProfile(
                userProfile.uid,
                userProfile.setDataForFireStore()
            );
            profileStore.setProfile(userProfile);

            return true;
        },
    }))
);
