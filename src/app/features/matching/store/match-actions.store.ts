import { inject } from '@angular/core';
import { signalStore, withMethods, withState } from '@ngrx/signals';

import { MatchParts, UserClass } from '../../../shared/models/user.model';
import { BillingStore } from '../../billing/store/billing.store';
import { ProfileStore } from '../../profile/store/profile.store';

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

function todayKey(date = new Date()) {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
}

function dailyActionStorageKey(uid: string, action: DailyAction) {
    return `amor:${action}:${uid}:${todayKey()}`;
}

function readDailyActionCount(uid: string, action: DailyAction) {
    if (typeof window === 'undefined') {
        return 0;
    }

    try {
        const storedValue = window.localStorage.getItem(
            dailyActionStorageKey(uid, action)
        );

        return Number(storedValue ?? 0) || 0;
    } catch (error) {
        console.error(error);
        return 0;
    }
}

function incrementDailyActionCount(uid: string, action: DailyAction) {
    const count = readDailyActionCount(uid, action);
    window.localStorage.setItem(
        dailyActionStorageKey(uid, action),
        String(count + 1)
    );
}

function getFreeRewindsRemainingForProfile(
    profile?: UserClass | null,
    fallbackUid?: string,
    billingStore?: BillingAccess
) {
    const uid = profile?.uid ?? fallbackUid;

    if (!uid || isPremiumProfile(profile, billingStore)) {
        return 0;
    }

    return Math.max(1 - readDailyActionCount(uid, 'rewind'), 0);
}

export const MatchActionsStore = signalStore(
    {
        providedIn: 'root',
    },
    withState(initialState),
    withMethods((
        store,
        profileStore = inject(ProfileStore),
        billingStore = inject(BillingStore)
    ) => ({
        hasPremiumAccess(profile?: UserClass | null) {
            return isPremiumProfile(profile, billingStore);
        },

        getFreeRewindsRemaining(profile?: UserClass | null, fallbackUid?: string) {
            return getFreeRewindsRemainingForProfile(
                profile,
                fallbackUid,
                billingStore
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
                billingStore
            ) <= 0;
        },

        canSuperLike(profile?: UserClass | null, fallbackUid?: string) {
            const uid = profile?.uid ?? fallbackUid;

            if (isPremiumProfile(profile, billingStore) && uid) {
                if (readDailyActionCount(uid, 'super-like') < PREMIUM_DAILY_SUPER_LIKES)
                    return true;
            }

            if ((billingStore.superLikesBalance?.() ?? 0) > 0) {
                return true;
            }

            if (!uid) {
                return false;
            }

            return readDailyActionCount(uid, 'super-like') < FREE_DAILY_SUPER_LIKES;
        },

        consumeDailyAction(
            profile: UserClass | undefined,
            action: DailyAction,
            fallbackUid?: string
        ) {
            const uid = profile?.uid ?? fallbackUid;

            if (!uid || typeof window === 'undefined') {
                return;
            }

            const isPremium = isPremiumProfile(profile, billingStore);

            if (action === 'rewind' && isPremium) {
                return;
            }

            if (action === 'super-like') {
                if (
                    isPremium &&
                    readDailyActionCount(uid, 'super-like') < PREMIUM_DAILY_SUPER_LIKES
                ) {
                    incrementDailyActionCount(uid, action);
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

            try {
                incrementDailyActionCount(uid, action);
            } catch (error) {
                console.error(error);
            }
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
