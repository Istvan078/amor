import { inject } from '@angular/core';
import { signalStore, withMethods, withState } from '@ngrx/signals';

import { MatchParts, UserClass } from '../../../shared/models/user.model';
import { ProfileStore } from '../../profile/store/profile.store';

type DailyAction = 'rewind' | 'super-like';

const initialState = {};

function ensureMatchParts(profile: UserClass) {
    profile.matchParts ??= new MatchParts();
    profile.matchParts.matches ??= [];
    profile.matchParts.possMatches ??= [];
    profile.matchParts.liked ??= [];
    profile.matchParts.notLiked ??= [];
    profile.matchParts.superLiked ??= [];

    return profile.matchParts;
}

function isPremiumProfile(profile?: UserClass | null) {
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

function getFreeRewindsRemainingForProfile(
    profile?: UserClass | null,
    fallbackUid?: string
) {
    const uid = profile?.uid ?? fallbackUid;

    if (!uid || isPremiumProfile(profile)) {
        return 0;
    }

    return Math.max(1 - readDailyActionCount(uid, 'rewind'), 0);
}

export const MatchActionsStore = signalStore(
    {
        providedIn: 'root',
    },
    withState(initialState),
    withMethods((store, profileStore = inject(ProfileStore)) => ({
        hasPremiumAccess(profile?: UserClass | null) {
            return isPremiumProfile(profile);
        },

        getFreeRewindsRemaining(profile?: UserClass | null, fallbackUid?: string) {
            return getFreeRewindsRemainingForProfile(profile, fallbackUid);
        },

        isRewindLocked(
            profile: UserClass | undefined,
            hasRewindCandidate: boolean,
            fallbackUid?: string
        ) {
            if (!hasRewindCandidate || isPremiumProfile(profile)) {
                return false;
            }

            return getFreeRewindsRemainingForProfile(profile, fallbackUid) <= 0;
        },

        canSuperLike(profile?: UserClass | null, fallbackUid?: string) {
            const uid = profile?.uid ?? fallbackUid;

            if (isPremiumProfile(profile)) {
                return true;
            }

            if (!uid) {
                return false;
            }

            return readDailyActionCount(uid, 'super-like') < 1;
        },

        consumeDailyAction(
            profile: UserClass | undefined,
            action: DailyAction,
            fallbackUid?: string
        ) {
            const uid = profile?.uid ?? fallbackUid;

            if (!uid || isPremiumProfile(profile) || typeof window === 'undefined') {
                return;
            }

            try {
                const count = readDailyActionCount(uid, action);
                window.localStorage.setItem(
                    dailyActionStorageKey(uid, action),
                    String(count + 1)
                );
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
