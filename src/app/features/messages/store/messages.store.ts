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

type MessagesState = {
    messages: Message[];
    loading: boolean;
    error: string | null;
};

const initialState: MessagesState = {
    messages: [],
    loading: false,
    error: null,
};

export const MessagesStore = signalStore(
    {
        providedIn: 'root',
    },

    withState(initialState),

    withMethods((store, repository = inject(MessagesRepository)) => {
        let unsubscribeMessages: (() => void) | null = null;
        let activeConversationId: string | null = null;

        const stopListening = () => {
            unsubscribeMessages?.();
            unsubscribeMessages = null;
            activeConversationId = null;
        };

        return {
            async loadMessages(userProfile: UserClass, matchProfile: UserClass) {
                if (!userProfile.uid || !matchProfile.uid) {
                    stopListening();
                    patchState(store, {
                        messages: [],
                        loading: false,
                    });
                    return;
                }

                const conversationId = repository.getConversationId(
                    userProfile.uid,
                    matchProfile.uid
                );

                if (activeConversationId === conversationId) {
                    return;
                }

                stopListening();
                activeConversationId = conversationId;

                patchState(store, {
                    loading: true,
                    error: null,
                });

                try {
                    unsubscribeMessages = repository.listenToMessages(
                        userProfile.uid,
                        matchProfile.uid,
                        (messages) => {
                            patchState(store, {
                                messages,
                                loading: false,
                                error: null,
                            });
                        },
                        (error) => {
                            console.error(error);
                            patchState(store, {
                                messages: [],
                                loading: false,
                                error: 'Failed to load messages.',
                            });
                        }
                    );
                } catch (error) {
                    console.error(error);
                    activeConversationId = null;
                    patchState(store, {
                        messages: [],
                        loading: false,
                        error: 'Failed to load messages.',
                    });
                }
            },

            async sendMessage(
                userProfile: UserClass,
                matchProfile: UserClass,
                message: Message
            ) {
                if (!userProfile.uid || !matchProfile.uid) {
                    return;
                }

                const messages = [...store.messages(), message];

                patchState(store, {
                    messages,
                });

                await repository.saveMessagesWithMatch(
                    userProfile.uid,
                    userProfile.email ?? '',
                    matchProfile.uid,
                    messages
                );
            },

            clearMessages() {
                stopListening();
                patchState(store, initialState);
            },
        };
    })
);
