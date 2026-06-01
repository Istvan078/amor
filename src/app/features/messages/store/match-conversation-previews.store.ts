import { inject } from '@angular/core';
import {
    patchState,
    signalStore,
    withMethods,
    withState,
} from '@ngrx/signals';

import { Message } from '../../../shared/models/message.model';
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

function buildConversationPreview(
    messages: Message[],
    userUid: string,
    matchUid: string
): MatchConversationPreview {
    const lastMessage = messages.at(-1);
    const unreadCount = messages.filter(
        (message) =>
            message.senderUid === matchUid &&
            message.sentToUid === userUid &&
            message.isRead !== true
    ).length;

    return {
        hasMessages: messages.length > 0,
        isLastMessageMine: lastMessage?.senderUid === userUid,
        lastMessage: lastMessage?.message?.trim() ?? '',
        unreadCount,
    };
}

export const MatchConversationPreviewsStore = signalStore(
    {
        providedIn: 'root',
    },
    withState(initialState),
    withMethods((store, repository = inject(MessagesRepository)) => {
        let signature = '';
        let requestId = 0;
        let unsubscribers: Array<() => void> = [];

        function stopListeners() {
            unsubscribers.forEach((unsubscribe) => unsubscribe());
            unsubscribers = [];
        }

        return {
            start(userProfile: UserClass | undefined, matches: UserClass[]) {
                const matchProfiles = matches.filter(
                    (match): match is UserClass & { uid: string } => !!match.uid
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
                        const unsubscribe = repository.listenToMessages(
                            userProfile.uid,
                            match.uid,
                            (messages) => {
                                if (activeRequestId !== requestId) {
                                    return;
                                }

                                patchState(store, {
                                    previews: {
                                        ...store.previews(),
                                        [match.uid]: buildConversationPreview(
                                            messages,
                                            userProfile.uid!,
                                            match.uid
                                        ),
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
