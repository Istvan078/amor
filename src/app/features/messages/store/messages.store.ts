import { inject } from '@angular/core';
import {
    patchState,
    signalStore,
    withMethods,
    withState,
} from '@ngrx/signals';

import { Message } from '../../../shared/models/message.model';
import { PublicProfile } from '../../../shared/models/public-profile.model';
import { UserClass } from '../../../shared/models/user.model';
import { AnalyticsService } from '../../analytics/data-access/analytics.service';
import {
    MESSAGE_PAGE_SIZE,
    MessagesRepository,
} from '../data-access/messages.repository';
import { initialMessagesState } from './messages.slice';

function getMessageKey(message: Message) {
    return (
        message.id ??
        message.clientId ??
        `${message.senderUid}:${message.sentToUid}:${message.number}:${message.sentAt?.getTime?.() ?? 0}`
    );
}

function getClientMessageId() {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

function patchMessage(
    messages: Message[],
    targetMessage: Message,
    patch: Partial<Message>
) {
    const targetKey = getMessageKey(targetMessage);

    return messages.map((message) =>
        getMessageKey(message) === targetKey
            ? {
                ...message,
                ...patch,
            }
            : message
    );
}

export const MessagesStore = signalStore(
    {
        providedIn: 'root',
    },

    withState(initialMessagesState),

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
            async loadMessages(userProfile: UserClass, matchProfile: PublicProfile) {
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
                matchProfile: PublicProfile
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
                matchProfile: PublicProfile,
                message: Message
            ) {
                if (!userProfile.uid || !matchProfile.uid) {
                    return null;
                }

                const optimisticMessage: Message = {
                    ...message,
                    clientId: message.clientId ?? getClientMessageId(),
                    deliveryStatus: 'sending',
                    isSent: false,
                    sendError: undefined,
                };

                patchState(store, {
                    messages: [...store.messages(), optimisticMessage],
                });

                try {
                    const messageId = await repository.sendMessageWithMatch(
                        userProfile.uid,
                        matchProfile.uid,
                        optimisticMessage
                    );

                    const sentMessage: Message = {
                        ...optimisticMessage,
                        id: messageId,
                        deliveryStatus: 'sent',
                        isSent: true,
                        sendError: undefined,
                    };

                    patchState(store, {
                        messages: patchMessage(
                            store.messages(),
                            optimisticMessage,
                            sentMessage
                        ),
                    });

                    void analytics.track(userProfile.uid, 'message_sent', {
                        matchUid: matchProfile.uid,
                        characterCount: message.message.trim().length,
                        hasAttachments: !!message.attachments?.length,
                        hasGif: message.messageType === 'gif',
                        messageType: message.messageType ?? 'text',
                    });

                    return sentMessage;
                } catch (error) {
                    console.error(error);

                    patchState(store, {
                        messages: patchMessage(store.messages(), optimisticMessage, {
                            deliveryStatus: 'failed',
                            isSent: false,
                            sendError: 'messages.sendFailed',
                        }),
                        error: 'Failed to send message.',
                    });

                    return null;
                }
            },

            async retryMessage(
                userProfile: UserClass,
                matchProfile: PublicProfile,
                message: Message
            ) {
                if (!userProfile.uid || !matchProfile.uid) {
                    return null;
                }

                const retryMessage: Message = {
                    ...message,
                    id: undefined,
                    clientId: message.clientId ?? getClientMessageId(),
                    sentAt: new Date(),
                    deliveryStatus: 'sending',
                    isSent: false,
                    sendError: undefined,
                };

                patchState(store, {
                    messages: patchMessage(store.messages(), message, retryMessage),
                    error: null,
                });

                try {
                    const messageId = await repository.sendMessageWithMatch(
                        userProfile.uid,
                        matchProfile.uid,
                        retryMessage
                    );

                    const sentMessage: Message = {
                        ...retryMessage,
                        id: messageId,
                        deliveryStatus: 'sent',
                        isSent: true,
                        sendError: undefined,
                    };

                    patchState(store, {
                        messages: patchMessage(
                            store.messages(),
                            retryMessage,
                            sentMessage
                        ),
                    });

                    void analytics.track(userProfile.uid, 'message_retry_sent', {
                        matchUid: matchProfile.uid,
                        messageType: message.messageType ?? 'text',
                    });

                    return sentMessage;
                } catch (error) {
                    console.error(error);

                    patchState(store, {
                        messages: patchMessage(store.messages(), retryMessage, {
                            deliveryStatus: 'failed',
                            isSent: false,
                            sendError: 'messages.sendFailed',
                        }),
                        error: 'Failed to send message.',
                    });

                    return null;
                }
            },

            async editMessage(
                userProfile: UserClass,
                matchProfile: PublicProfile,
                message: Message,
                nextText: string
            ) {
                if (
                    !userProfile.uid ||
                    !matchProfile.uid ||
                    !message.id ||
                    message.senderUid !== userProfile.uid ||
                    message.isDeleted
                ) {
                    return false;
                }

                const trimmedText = nextText.trim();

                if (!trimmedText || trimmedText === message.message) {
                    return false;
                }

                const previousMessages = store.messages();
                const editedAt = new Date();

                patchState(store, {
                    messages: patchMessage(previousMessages, message, {
                        message: trimmedText,
                        isEdited: true,
                        editedAt,
                    }),
                    error: null,
                });

                try {
                    await repository.editMessage(
                        userProfile.uid,
                        matchProfile.uid,
                        message,
                        trimmedText
                    );

                    void analytics.track(userProfile.uid, 'message_edited', {
                        matchUid: matchProfile.uid,
                    });

                    return true;
                } catch (error) {
                    console.error(error);
                    patchState(store, {
                        messages: previousMessages,
                        error: 'Failed to edit message.',
                    });
                    return false;
                }
            },

            async deleteMessage(
                userProfile: UserClass,
                matchProfile: PublicProfile,
                message: Message
            ) {
                if (
                    !userProfile.uid ||
                    !matchProfile.uid ||
                    !message.id ||
                    message.senderUid !== userProfile.uid ||
                    message.isDeleted
                ) {
                    return false;
                }

                const previousMessages = store.messages();
                const deletedAt = new Date();

                patchState(store, {
                    messages: patchMessage(previousMessages, message, {
                        message: '',
                        isDeleted: true,
                        isEdited: false,
                        deletedAt,
                        reactions: [],
                    }),
                    error: null,
                });

                try {
                    await repository.deleteMessage(
                        userProfile.uid,
                        matchProfile.uid,
                        message
                    );

                    void analytics.track(userProfile.uid, 'message_deleted', {
                        matchUid: matchProfile.uid,
                    });

                    return true;
                } catch (error) {
                    console.error(error);
                    patchState(store, {
                        messages: previousMessages,
                        error: 'Failed to delete message.',
                    });
                    return false;
                }
            },

            async toggleMessageReaction(
                userProfile: UserClass,
                matchProfile: PublicProfile,
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
                matchProfile: PublicProfile,
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
                patchState(store, initialMessagesState);
            },
        };
    })
);
