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
import {
    MESSAGE_PAGE_SIZE,
    MessagesRepository,
} from '../data-access/messages.repository';

type MessagesState = {
    messages: Message[];
    loading: boolean;
    loadingOlderMessages: boolean;
    hasOlderMessages: boolean;
    error: string | null;
    isMatchTyping: boolean;
};

const initialState: MessagesState = {
    messages: [],
    loading: false,
    loadingOlderMessages: false,
    hasOlderMessages: false,
    error: null,
    isMatchTyping: false,
};

function getMessageKey(message: Message) {
    return (
        message.id ??
        `${message.senderUid}:${message.sentToUid}:${message.number}:${message.sentAt?.getTime?.() ?? 0}`
    );
}

function getOptimisticSignature(message: Message) {
    return [
        message.senderUid,
        message.sentToUid,
        message.number,
        message.messageType ?? 'text',
        message.message,
        message.gif?.id ?? '',
    ].join(':');
}

function mergeMessages(currentMessages: Message[], nextMessages: Message[]) {
    const persistedSignatures = new Set(
        nextMessages
            .filter((message) => !!message.id)
            .map((message) => getOptimisticSignature(message))
    );
    const messagesByKey = new Map<string, Message>();

    for (const message of currentMessages) {
        if (!message.id && persistedSignatures.has(getOptimisticSignature(message))) {
            continue;
        }

        messagesByKey.set(getMessageKey(message), message);
    }

    for (const message of nextMessages) {
        messagesByKey.set(getMessageKey(message), message);
    }

    return [...messagesByKey.values()].sort((messageA, messageB) => {
        const timeDifference =
            (messageA.sentAt?.getTime?.() ?? 0) -
            (messageB.sentAt?.getTime?.() ?? 0);

        if (timeDifference !== 0) {
            return timeDifference;
        }

        return (messageA.number ?? 0) - (messageB.number ?? 0);
    });
}

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
        let olderMessagesExhausted = false;

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
            olderMessagesExhausted = false;
            setMatchTyping(false);
        };

        return {
            async loadMessages(userProfile: UserClass, matchProfile: UserClass) {
                if (!userProfile.uid || !matchProfile.uid) {
                    stopListening();
                    patchState(store, {
                        messages: [],
                        loading: false,
                        loadingOlderMessages: false,
                        hasOlderMessages: false,
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
                    loadingOlderMessages: false,
                    hasOlderMessages: false,
                    error: null,
                });

                try {
                    unsubscribeMessages = repository.listenToMessages(
                        myUid,
                        matchUid,
                        (messages) => {
                            const hasExistingMessages =
                                activeConversationId === conversationId &&
                                store.messages().length > 0;
                            const mergedMessages = hasExistingMessages
                                ? mergeMessages(store.messages(), messages)
                                : messages;

                            patchState(store, {
                                messages: mergedMessages,
                                loading: false,
                                hasOlderMessages:
                                    !olderMessagesExhausted &&
                                    (store.hasOlderMessages() ||
                                        messages.length >= MESSAGE_PAGE_SIZE),
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

            async loadOlderMessages(
                userProfile: UserClass,
                matchProfile: UserClass
            ) {
                if (
                    !userProfile.uid ||
                    !matchProfile.uid ||
                    store.loadingOlderMessages() ||
                    !store.hasOlderMessages()
                ) {
                    return;
                }

                const oldestMessage = store.messages()[0];

                if (!oldestMessage) {
                    return;
                }

                patchState(store, {
                    loadingOlderMessages: true,
                    error: null,
                });

                try {
                    const olderMessages = await repository.loadOlderMessages(
                        userProfile.uid,
                        matchProfile.uid,
                        oldestMessage
                    );

                    if (olderMessages.length < MESSAGE_PAGE_SIZE) {
                        olderMessagesExhausted = true;
                    }

                    patchState(store, {
                        messages: mergeMessages(store.messages(), olderMessages),
                        loadingOlderMessages: false,
                        hasOlderMessages: olderMessages.length >= MESSAGE_PAGE_SIZE,
                    });
                } catch (error) {
                    console.error(error);
                    patchState(store, {
                        loadingOlderMessages: false,
                        error: 'Failed to load older messages.',
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
                    hasGif: message.messageType === 'gif',
                    messageType: message.messageType ?? 'text',
                });
            },

            async toggleMessageReaction(
                userProfile: UserClass,
                matchProfile: UserClass,
                message: Message,
                emoji: string
            ) {
                if (!userProfile.uid || !matchProfile.uid || !message.id) {
                    return;
                }

                const reactions = await repository.toggleMessageReaction(
                    userProfile.uid,
                    matchProfile.uid,
                    message,
                    emoji
                );

                patchState(store, {
                    messages: store.messages().map((storedMessage) =>
                        storedMessage.id === message.id
                            ? {
                                ...storedMessage,
                                reactions,
                            }
                            : storedMessage
                    ),
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
