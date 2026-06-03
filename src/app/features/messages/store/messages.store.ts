import { inject } from '@angular/core';
import {
    patchState,
    signalStore,
    withMethods,
    withState,
} from '@ngrx/signals';

import { Message } from '../../../shared/models/message.model';
import { UserClass } from '../../../shared/models/user.model';
import { AnalyticsService } from '../../analytics/data-access/analytics.service';
import { MessagesRepository } from '../data-access/messages.repository';

type MessagesState = {
    messages: Message[];
    loading: boolean;
    error: string | null;
    isMatchTyping: boolean;
};

const initialState: MessagesState = {
    messages: [],
    loading: false,
    error: null,
    isMatchTyping: false,
};

export const MessagesStore = signalStore(
    {
        providedIn: 'root',
    },

    withState(initialState),

    withMethods((
        store,
        repository = inject(MessagesRepository),
        analytics = inject(AnalyticsService)
    ) => {
        let unsubscribeMessages: (() => void) | null = null;
        let unsubscribeTyping: (() => void) | null = null;
        let activeConversationId: string | null = null;
        let typingExpiryTimer: ReturnType<typeof setTimeout> | null = null;

        const clearTypingExpiryTimer = () => {
            if (!typingExpiryTimer) {
                return;
            }

            clearTimeout(typingExpiryTimer);
            typingExpiryTimer = null;
        };

        const setMatchTyping = (isMatchTyping: boolean) => {
            clearTypingExpiryTimer();
            patchState(store, { isMatchTyping });

            if (!isMatchTyping) {
                return;
            }

            typingExpiryTimer = setTimeout(() => {
                typingExpiryTimer = null;
                patchState(store, { isMatchTyping: false });
            }, 8500);
        };

        const stopListening = () => {
            unsubscribeMessages?.();
            unsubscribeTyping?.();
            unsubscribeMessages = null;
            unsubscribeTyping = null;
            activeConversationId = null;
            setMatchTyping(false);
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

                const myUid = userProfile.uid;
                const matchUid = matchProfile.uid;
                const conversationId = repository.getConversationId(
                    myUid,
                    matchUid
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
                        myUid,
                        matchUid,
                        (messages) => {
                            patchState(store, {
                                messages,
                                loading: false,
                                error: null,
                            });

                            const hasUnreadIncomingMessages = messages.some(
                                (message) =>
                                    message.sentToUid === myUid &&
                                    message.senderUid === matchUid &&
                                    message.isRead !== true
                            );

                            if (hasUnreadIncomingMessages) {
                                void repository.markConversationMessagesRead(
                                    myUid,
                                    matchUid
                                );
                            }
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
                    unsubscribeTyping = repository.listenToTypingStatus(
                        myUid,
                        matchUid,
                        (typing) => setMatchTyping(typing.isTyping),
                        (error) => {
                            console.error(error);
                            setMatchTyping(false);
                        }
                    );
                    await repository.markConversationMessagesRead(
                        myUid,
                        matchUid
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

                patchState(store, {
                    messages: [...store.messages(), message],
                });

                await repository.sendMessageWithMatch(
                    userProfile.uid,
                    matchProfile.uid,
                    message
                );

                void analytics.track(userProfile.uid, 'message_sent', {
                    matchUid: matchProfile.uid,
                    characterCount: message.message.trim().length,
                    hasAttachments: !!message.attachments?.length,
                });
            },

            async setTypingStatus(
                userProfile: UserClass,
                matchProfile: UserClass,
                isTyping: boolean
            ) {
                if (!userProfile.uid || !matchProfile.uid) {
                    return;
                }

                await repository.setTypingStatus(
                    userProfile.uid,
                    matchProfile.uid,
                    isTyping
                );
            },

            clearMessages() {
                stopListening();
                patchState(store, initialState);
            },
        };
    })
);
