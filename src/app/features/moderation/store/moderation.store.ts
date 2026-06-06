import { inject } from '@angular/core';
import {
    patchState,
    signalStore,
    withMethods,
    withState,
} from '@ngrx/signals';

import { Message } from '../../../shared/models/message.model';
import { MatchParts, UserClass } from '../../../shared/models/user.model';
import { ProfileStore } from '../../profile/store/profile.store';
import {
    ModerationRepository,
} from '../data-access/moderation.repository';
import { initialModerationState } from './moderation.slice';
import { setModerationError, setModerationLastReport, setModerationLoaded, setModerationLoading } from './moderation.updaters';



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

function getConversationId(uidA: string, uidB: string) {
    return [uidA, uidB].sort((a, b) => a.localeCompare(b)).join('_');
}

function getMessageExcerpt(message: Message) {
    const content =
        message.messageType === 'gif'
            ? message.gif?.title ?? 'GIF'
            : message.message;

    return content.trim().slice(0, 500);
}

export const ModerationStore = signalStore(
    {
        providedIn: 'root',
    },
    withState(initialModerationState),
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

            patchState(store, setModerationLoading());

            try {
                await profileStore.updateProfile(userProfile.uid, { blockedUsers });
                userProfile.blockedUsers = blockedUsers;
                patchState(store, setModerationLoaded());
                return blockedUsers;
            } catch (error) {
                patchState(store, setModerationError('Failed to block user.'));
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

            patchState(store, setModerationLoading());

            try {
                await profileStore.updateProfile(userProfile.uid, { blockedUsers });
                userProfile.blockedUsers = blockedUsers;
                patchState(store, setModerationLoaded());
                return blockedUsers;
            } catch (error) {
                patchState(store, setModerationError('Failed to unblock user.'));
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

            patchState(store, setModerationLoading());

            try {
                const persistedMatchParts =
                    await repository.removeMatchForBothUsers(
                        userProfile.uid,
                        matchUid
                    );
                Object.assign(matchParts, persistedMatchParts);
                userProfile.matchParts = matchParts;
                patchState(store, setModerationLoaded());
                return matchParts;
            } catch (error) {
                patchState(store, setModerationError('Failed to remove match.'));
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

            patchState(store, setModerationLoading());

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
                patchState(store, setModerationLastReport(report));

                return report;
            } catch (error) {
                patchState(store, setModerationError('Failed to report user.'));
                throw error;
            }
        },

        async reportMessage(
            userProfile: UserClass,
            matchProfile: UserClass,
            message: Message,
            reason = 'conversation_report',
            reasonLabel?: string
        ) {
            if (
                !userProfile.uid ||
                !matchProfile.uid ||
                !message.id ||
                message.senderUid !== matchProfile.uid ||
                message.sentToUid !== userProfile.uid
            ) {
                return undefined;
            }

            const reportedUsers = appendUnique(
                userProfile.reportedUsers,
                matchProfile.uid
            );
            const messageText = getMessageExcerpt(message);
            const conversationId = getConversationId(
                userProfile.uid,
                matchProfile.uid
            );
            const reportDescription = [
                `Message report: ${reasonLabel || reason}.`,
                `Message: "${messageText || 'No text content'}"`,
                `Message id: ${message.id}`,
                `Conversation id: ${conversationId}`,
            ].join('\n');

            patchState(store, setModerationLoading());

            try {
                const report = await repository.createReport({
                    reporterUid: userProfile.uid,
                    reportedUid: matchProfile.uid,
                    reason,
                    description: reportDescription,
                    source: 'message',
                    conversationId,
                    messageId: message.id,
                    messageText,
                    messageSentAt: message.sentAt?.toISOString?.() ?? '',
                    messageSenderUid: message.senderUid,
                });

                await profileStore.updateProfile(userProfile.uid, {
                    reportedUsers,
                });

                userProfile.reportedUsers = reportedUsers;
                patchState(store, setModerationLastReport(report));

                return report;
            } catch (error) {
                patchState(store, setModerationError('Failed to report message.'));
                throw error;
            }
        },
    }
    )),
);
