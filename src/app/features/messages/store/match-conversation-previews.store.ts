import { computed, inject } from '@angular/core';
import {
    patchState,
    signalStore,
    withComputed,
    withMethods,
    withState,
} from '@ngrx/signals';

import { PublicProfile } from '../../../shared/models/public-profile.model';
import { UserClass } from '../../../shared/models/user.model';
import { MessagesRepository } from '../data-access/messages.repository';

export type MatchConversationPreview = {
    hasMessages: boolean;
    isLastMessageMine: boolean;
    lastMessage: string;
    unreadCount: number;
};

type MatchConversationPreviewsState = {
    previews: Record<string, MatchConversationPreview>;
};

const initialState: MatchConversationPreviewsState = {
    previews: {},
};

function emptyConversationPreview(): MatchConversationPreview {
    return {
        hasMessages: false,
        isLastMessageMine: false,
        lastMessage: '',
        unreadCount: 0,
    };
}

export const MatchConversationPreviewsStore = signalStore(
    {
        providedIn: 'root',
    },
    withState(initialState),
    withComputed((store) => ({
        totalUnreadCount: computed(() =>
            Object.values(store.previews()).reduce(
                (total, preview) => total + preview.unreadCount,
                0
            )
        ),
    })),
    withMethods((store, repository = inject(MessagesRepository)) => {
        let signature = '';
        let requestId = 0;
        let unsubscribers: Array<() => void> = [];

        function stopListeners() {
            unsubscribers.forEach((unsubscribe) => unsubscribe());
            unsubscribers = [];
        }

        return {
            start(userProfile: UserClass | undefined, matches: PublicProfile[]) {
                const matchProfiles = matches.filter(
                    (match): match is PublicProfile & { uid: string } => !!match.uid
                );

                if (!userProfile?.uid || !matchProfiles.length) {
                    stopListeners();
                    signature = '';
                    requestId++;
                    patchState(store, initialState);
                    return;
                }

                const nextSignature = [
                    userProfile.uid,
                    ...matchProfiles.map((match) => match.uid),
                ].join('|');

                if (nextSignature === signature) {
                    return;
                }

                stopListeners();
                signature = nextSignature;
                const activeRequestId = ++requestId;

                patchState(store, {
                    previews: Object.fromEntries(
                        matchProfiles.map((match) => [
                            match.uid,
                            emptyConversationPreview(),
                        ])
                    ),
                });

                for (const match of matchProfiles) {
                    try {
                        const unsubscribe = repository.listenToConversationPreview(
                            userProfile.uid,
                            match.uid,
                            (preview) => {
                                if (activeRequestId !== requestId) {
                                    return;
                                }

                                patchState(store, {
                                    previews: {
                                        ...store.previews(),
                                        [match.uid]: preview,
                                    },
                                });
                            },
                            (error) => console.error(error)
                        );

                        unsubscribers.push(unsubscribe);
                    } catch (error) {
                        console.error(error);
                    }
                }
            },

            upsertPreview(matchUid: string, preview: MatchConversationPreview) {
                patchState(store, {
                    previews: {
                        ...store.previews(),
                        [matchUid]: preview,
                    },
                });
            },

            removePreview(matchUid: string) {
                const { [matchUid]: _removedPreview, ...remainingPreviews } =
                    store.previews();

                patchState(store, {
                    previews: remainingPreviews,
                });
            },

            stop() {
                stopListeners();
                signature = '';
                requestId++;
                patchState(store, initialState);
            },
        };
    })
);
