import { inject } from '@angular/core';
import {
    patchState,
    signalStore,
    withMethods,
    withState,
} from '@ngrx/signals';

import { MatchParts, UserClass } from '../../../shared/models/user.model';
import { ProfileStore } from '../../profile/store/profile.store';
import {
    ModerationReport,
    ModerationRepository,
} from '../data-access/moderation.repository';

type ModerationState = {
    loading: boolean;
    error: string | null;
    lastReport: ModerationReport | null;
};

const initialState: ModerationState = {
    loading: false,
    error: null,
    lastReport: null,
};

function ensureMatchParts(profile: UserClass) {
    profile.matchParts ??= new MatchParts();
    profile.matchParts.matches ??= [];
    profile.matchParts.possMatches ??= [];
    profile.matchParts.liked ??= [];
    profile.matchParts.notLiked ??= [];
    profile.matchParts.superLiked ??= [];

    return profile.matchParts;
}

function appendUnique(values: string[] | undefined, value: string) {
    const currentValues = Array.isArray(values) ? values : [];

    return currentValues.includes(value)
        ? currentValues
        : [...currentValues, value];
}

export const ModerationStore = signalStore(
    {
        providedIn: 'root',
    },
    withState(initialState),
    withMethods((
        store,
        repository = inject(ModerationRepository),
        profileStore = inject(ProfileStore)
    ) => ({
        async blockUser(userProfile: UserClass, matchProfile: UserClass) {
            if (!userProfile.uid || !matchProfile.uid) {
                return undefined;
            }

            const blockedUsers = appendUnique(
                userProfile.blockedUsers,
                matchProfile.uid
            );

            patchState(store, { loading: true, error: null });

            try {
                await profileStore.updateProfile(userProfile.uid, { blockedUsers });
                userProfile.blockedUsers = blockedUsers;
                patchState(store, { loading: false });
                return blockedUsers;
            } catch (error) {
                console.error(error);
                patchState(store, {
                    loading: false,
                    error: 'Failed to block user.',
                });
                throw error;
            }
        },

        async unblockUser(userProfile: UserClass, matchProfile: UserClass) {
            if (!userProfile.uid || !matchProfile.uid) {
                return undefined;
            }

            const blockedUsers = (userProfile.blockedUsers ?? []).filter(
                (uid) => uid !== matchProfile.uid
            );

            patchState(store, { loading: true, error: null });

            try {
                await profileStore.updateProfile(userProfile.uid, { blockedUsers });
                userProfile.blockedUsers = blockedUsers;
                patchState(store, { loading: false });
                return blockedUsers;
            } catch (error) {
                console.error(error);
                patchState(store, {
                    loading: false,
                    error: 'Failed to unblock user.',
                });
                throw error;
            }
        },

        async removeMatch(userProfile: UserClass, matchProfile: UserClass) {
            if (!userProfile.uid || !matchProfile.uid) {
                return undefined;
            }

            const matchUid = matchProfile.uid;
            const matchParts = ensureMatchParts(userProfile);

            matchParts.matches = matchParts.matches.filter((uid) => uid !== matchUid);
            matchParts.liked = matchParts.liked.filter((uid) => uid !== matchUid);
            matchParts.superLiked = matchParts.superLiked.filter(
                (uid) => uid !== matchUid
            );

            if (!matchParts.notLiked.includes(matchUid)) {
                matchParts.notLiked.push(matchUid);
            }

            patchState(store, { loading: true, error: null });

            try {
                await profileStore.updateProfile(userProfile.uid, { matchParts });
                userProfile.matchParts = matchParts;
                patchState(store, { loading: false });
                return matchParts;
            } catch (error) {
                console.error(error);
                patchState(store, {
                    loading: false,
                    error: 'Failed to remove match.',
                });
                throw error;
            }
        },

        async reportUser(
            userProfile: UserClass,
            matchProfile: UserClass,
            reason = 'conversation_report',
            description?: string
        ) {
            if (!userProfile.uid || !matchProfile.uid) {
                return undefined;
            }

            const reportedUsers = appendUnique(
                userProfile.reportedUsers,
                matchProfile.uid
            );
            const reportDescription =
                description ??
                `Reported from conversation with ${[
                    matchProfile.firstName,
                    matchProfile.lastName,
                ]
                    .filter(Boolean)
                    .join(' ') || matchProfile.uid}`;

            patchState(store, { loading: true, error: null });

            try {
                const report = await repository.createReport({
                    reporterUid: userProfile.uid,
                    reportedUid: matchProfile.uid,
                    reason,
                    description: reportDescription,
                });

                await profileStore.updateProfile(userProfile.uid, {
                    reportedUsers,
                });

                userProfile.reportedUsers = reportedUsers;
                patchState(store, {
                    loading: false,
                    lastReport: report,
                });

                return report;
            } catch (error) {
                console.error(error);
                patchState(store, {
                    loading: false,
                    error: 'Failed to report user.',
                });
                throw error;
            }
        },
    }))
);
