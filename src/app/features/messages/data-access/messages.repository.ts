import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
    Firestore,
    addDoc,
    collection,
    doc,
    getDocs,
    increment,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    startAfter,
    where,
    writeBatch,
} from '@angular/fire/firestore';

import {
    Message,
    MessageGif,
    MessageReaction,
} from '../../../shared/models/message.model';

export type ConversationPreviewData = {
    hasMessages: boolean;
    isLastMessageMine: boolean;
    lastMessage: string;
    unreadCount: number;
};

export type ConversationTypingData = {
    isTyping: boolean;
};

export const MESSAGE_PAGE_SIZE = 30;

@Injectable({
    providedIn: 'root',
})
export class MessagesRepository {
    private injector = inject(Injector);
    private firestore = inject(Firestore);

    async getMessages(
        myUid: string,
        _myEmail: string,
        matchUid: string,
        _matchEmail: string
    ) {
        return this.getConversationMessages(myUid, matchUid);
    }

    listenToConversationPreview(
        myUid: string,
        matchUid: string,
        onPreview: (preview: ConversationPreviewData) => void,
        onError?: (error: unknown) => void
    ) {
        const conversationId = this.getConversationId(myUid, matchUid);

        return this.runInFirebaseContext(() => {
            const conversationRef = doc(
                this.firestore,
                `conversations/${conversationId}`
            );

            return onSnapshot(
                conversationRef,
                (snapshot) => {
                    if (!snapshot.exists()) {
                        onPreview(this.emptyConversationPreview());
                        return;
                    }

                    const data = snapshot.data() as Record<string, unknown>;
                    const lastMessage = this.mapLastMessage(data['lastMessage']);
                    const unreadCounts = this.toRecord(data['unreadCounts']);

                    onPreview({
                        hasMessages: !!lastMessage?.text,
                        isLastMessageMine: lastMessage?.senderUid === myUid,
                        lastMessage: lastMessage?.text ?? '',
                        unreadCount: Number(unreadCounts[myUid] ?? 0),
                    });
                },
                (error) => onError?.(error)
            );
        });
    }

    listenToMessages(
        myUid: string,
        matchUid: string,
        onMessages: (messages: Message[]) => void,
        onError?: (error: unknown) => void
    ) {
        const conversationId = this.getConversationId(myUid, matchUid);

        return this.runInFirebaseContext(() => {
            const messagesCollection = collection(
                this.firestore,
                `conversations/${conversationId}/messages`
            );
            const messagesQuery = query(
                messagesCollection,
                orderBy('sentAt', 'desc'),
                limit(MESSAGE_PAGE_SIZE)
            );

            return onSnapshot(
                messagesQuery,
                (snapshot) => {
                    onMessages(
                        snapshot.docs
                            .map((messageSnapshot) =>
                                this.mapConversationMessage(
                                    messageSnapshot.id,
                                    messageSnapshot.data()
                                )
                            )
                            .reverse()
                    );
                },
                (error) => onError?.(error)
            );
        });
    }

    listenToTypingStatus(
        myUid: string,
        matchUid: string,
        onTypingStatus: (typing: ConversationTypingData) => void,
        onError?: (error: unknown) => void
    ) {
        const conversationId = this.getConversationId(myUid, matchUid);

        return this.runInFirebaseContext(() => {
            const conversationRef = doc(
                this.firestore,
                `conversations/${conversationId}`
            );

            return onSnapshot(
                conversationRef,
                (snapshot) => {
                    if (!snapshot.exists()) {
                        onTypingStatus({ isTyping: false });
                        return;
                    }

                    const data = snapshot.data() as Record<string, unknown>;
                    const typing = this.toRecord(data['typing']);

                    onTypingStatus({
                        isTyping: this.isTypingTimestampActive(typing[matchUid]),
                    });
                },
                (error) => onError?.(error)
            );
        });
    }

    async setTypingStatus(myUid: string, matchUid: string, isTyping: boolean) {
        const conversationId = this.getConversationId(myUid, matchUid);
        const participants = this.getConversationParticipants(myUid, matchUid);

        await this.runInFirebaseContext(async () => {
            const conversationRef = doc(
                this.firestore,
                `conversations/${conversationId}`
            );

            await setDoc(
                conversationRef,
                {
                    participants,
                    typing: {
                        [myUid]: isTyping ? serverTimestamp() : null,
                    },
                },
                { merge: true }
            );
        });
    }

    async saveMessagesWithMatch(
        myUid: string,
        _myEmail: string,
        matchUid: string,
        messages: Message[]
    ) {
        const conversationId = this.getConversationId(myUid, matchUid);
        const participants = this.getConversationParticipants(myUid, matchUid);
        const lastMessage = messages.at(-1);

        await this.runInFirebaseContext(async () => {
            const conversationRef = doc(
                this.firestore,
                `conversations/${conversationId}`
            );
            const messagesCollection = collection(conversationRef, 'messages');

            await setDoc(
                conversationRef,
                {
                    participants,
                    lastMessage: lastMessage
                        ? {
                            senderUid: lastMessage.senderUid,
                            sentToUid: lastMessage.sentToUid,
                            text: this.getMessagePreviewText(lastMessage),
                            number: lastMessage.number,
                            type: lastMessage.messageType ?? 'text',
                        }
                        : null,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );

            const batch = writeBatch(this.firestore);

            for (const [index, message] of messages.entries()) {
                const messageRef = doc(
                    messagesCollection,
                    this.getMessageDocumentId(message, index)
                );

                batch.set(
                    messageRef,
                    this.mapMessageForConversation(message),
                    { merge: true }
                );
            }

            await batch.commit();
        });
    }

    async sendMessageWithMatch(
        myUid: string,
        matchUid: string,
        message: Message
    ) {
        const conversationId = this.getConversationId(myUid, matchUid);
        const participants = this.getConversationParticipants(myUid, matchUid);

        await this.runInFirebaseContext(async () => {
            const conversationRef = doc(
                this.firestore,
                `conversations/${conversationId}`
            );
            const messagesCollection = collection(conversationRef, 'messages');
            const sentAt = serverTimestamp();

            await setDoc(
                conversationRef,
                {
                    participants,
                    lastMessage: {
                        senderUid: message.senderUid,
                        sentToUid: message.sentToUid,
                        text: this.getMessagePreviewText(message),
                        number: message.number,
                        type: message.messageType ?? 'text',
                        sentAt,
                    },
                    unreadCounts: {
                        [myUid]: 0,
                        [matchUid]: increment(1),
                    },
                    updatedAt: sentAt,
                },
                { merge: true }
            );

            await addDoc(messagesCollection, {
                ...this.mapMessageForConversation(message),
                sentAt,
            });
        });
    }

    async markConversationMessagesRead(myUid: string, matchUid: string) {
        const conversationId = this.getConversationId(myUid, matchUid);

        await this.runInFirebaseContext(async () => {
            const messagesCollection = collection(
                this.firestore,
                `conversations/${conversationId}/messages`
            );
            const unreadMessagesQuery = query(
                messagesCollection,
                where('sentToUid', '==', myUid),
                where('senderUid', '==', matchUid),
                where('isRead', '==', false),
                limit(100)
            );
            const snapshot = await getDocs(unreadMessagesQuery);
            const batch = writeBatch(this.firestore);
            let hasUnreadMessages = false;

            snapshot.docs.forEach((messageSnapshot) => {
                hasUnreadMessages = true;
                batch.update(messageSnapshot.ref, {
                    isRead: true,
                    readAt: serverTimestamp(),
                });
            });

            if (hasUnreadMessages) {
                await batch.commit();
            }

            const conversationRef = doc(
                this.firestore,
                `conversations/${conversationId}`
            );

            await setDoc(
                conversationRef,
                {
                    unreadCounts: {
                        [myUid]: 0,
                    },
                },
                { merge: true }
            );

        });
    }

    async toggleMessageReaction(
        myUid: string,
        matchUid: string,
        message: Message,
        emoji: string
    ) {
        if (!message.id) {
            return message.reactions ?? [];
        }

        const conversationId = this.getConversationId(myUid, matchUid);
        return this.runInFirebaseContext(async () => {
            const messageRef = doc(
                this.firestore,
                `conversations/${conversationId}/messages/${message.id}`
            );

            return runTransaction(this.firestore, async (transaction) => {
                const snapshot = await transaction.get(messageRef);
                const currentReactions = snapshot.exists()
                    ? this.mapMessageReactions(snapshot.data()['reactions'])
                    : message.reactions ?? [];
                const reactions = this.toggleReaction(
                    currentReactions,
                    myUid,
                    emoji
                );

                transaction.update(messageRef, {
                    reactions: reactions.map((reaction) => ({
                        emoji: reaction.emoji,
                        userUids: reaction.userUids,
                        updatedAt: reaction.updatedAt ?? new Date(),
                    })),
                });

                return reactions;
            });
        });
    }

    async loadOlderMessages(myUid: string, matchUid: string, beforeMessage: Message) {
        const conversationId = this.getConversationId(myUid, matchUid);

        return this.runInFirebaseContext(async () => {
            const messagesCollection = collection(
                this.firestore,
                `conversations/${conversationId}/messages`
            );
            const messagesQuery = query(
                messagesCollection,
                orderBy('sentAt', 'desc'),
                startAfter(beforeMessage.sentAt),
                limit(MESSAGE_PAGE_SIZE)
            );
            const snapshot = await getDocs(messagesQuery);

            return snapshot.docs
                .map((messageSnapshot) =>
                    this.mapConversationMessage(
                        messageSnapshot.id,
                        messageSnapshot.data()
                    )
                )
                .reverse();
        });
    }

    private async getConversationMessages(myUid: string, matchUid: string) {
        const conversationId = this.getConversationId(myUid, matchUid);

        const snapshot = await this.runInFirebaseContext(() => {
            const messagesCollection = collection(
                this.firestore,
                `conversations/${conversationId}/messages`
            );
            const messagesQuery = query(
                messagesCollection,
                orderBy('sentAt', 'desc'),
                limit(MESSAGE_PAGE_SIZE)
            );

            return getDocs(messagesQuery);
        });

        return snapshot.docs
            .map((messageSnapshot) =>
                this.mapConversationMessage(
                    messageSnapshot.id,
                    messageSnapshot.data()
                )
            )
            .reverse();
    }

    getConversationId(uidA: string, uidB: string) {
        return this.getConversationParticipants(uidA, uidB).join('_');
    }

    private getConversationParticipants(uidA: string, uidB: string) {
        return [uidA, uidB].sort((a, b) => a.localeCompare(b));
    }

    private getMessageDocumentId(message: Message, index: number) {
        return `${message.number || index}_${message.senderUid || 'unknown'}`;
    }

    private mapMessageForConversation(message: Message) {
        return {
            senderUid: message.senderUid,
            sentToUid: message.sentToUid,
            text: message.message,
            type: message.messageType ?? 'text',
            number: message.number,
            sentAt: message.sentAt ?? serverTimestamp(),
            readAt: message.readAt ?? null,
            isRead: message.isRead ?? false,
            attachments: message.attachments ?? [],
            gif: message.gif ? this.mapGifForConversation(message.gif) : null,
            reactions: (message.reactions ?? []).map((reaction) => ({
                emoji: reaction.emoji,
                userUids: reaction.userUids,
                updatedAt: reaction.updatedAt ?? new Date(),
            })),
            isDeleted: message.isDeleted ?? false,
            isStarred: message.isStarred ?? false,
            isEdited: message.isEdited ?? false,
        };
    }

    private mapConversationMessage(id: string, data: Record<string, unknown>) {
        const message = new Message();

        message.id = id;
        message.senderUid = String(data['senderUid'] ?? '');
        message.sentToUid = String(data['sentToUid'] ?? '');
        message.message = String(data['text'] ?? data['message'] ?? '');
        message.messageType = data['type'] === 'gif' ? 'gif' : 'text';
        message.number = Number(data['number'] ?? 0);
        message.sentAt = this.toDate(data['sentAt']) ?? new Date();
        message.readAt = this.toDate(data['readAt']);
        message.isRead = data['isRead'] === true;
        message.attachments = Array.isArray(data['attachments'])
            ? (data['attachments'] as string[])
            : [];
        message.isDeleted = data['isDeleted'] === true;
        message.isStarred = data['isStarred'] === true;
        message.isEdited = data['isEdited'] === true;
        message.gif = this.mapMessageGif(data['gif']);
        message.reactions = this.mapMessageReactions(data['reactions']);

        return message;
    }

    private getMessagePreviewText(message: Message) {
        if (message.message.trim()) {
            return message.message.trim();
        }

        if (message.messageType === 'gif' && message.gif?.title) {
            return message.gif.title;
        }

        return 'GIF';
    }

    private mapGifForConversation(gif: MessageGif) {
        return {
            id: gif.id,
            title: gif.title,
            url: gif.url,
            previewUrl: gif.previewUrl ?? gif.url,
            alt: gif.alt ?? gif.title,
            source: gif.source,
        };
    }

    private mapMessageGif(value: unknown): MessageGif | undefined {
        if (!value || typeof value !== 'object') {
            return undefined;
        }

        const gif = value as Record<string, unknown>;
        const id = String(gif['id'] ?? '');
        const title = String(gif['title'] ?? '');
        const url = String(gif['url'] ?? '');

        if (!id || !url) {
            return undefined;
        }

        return {
            id,
            title: title || 'GIF',
            url,
            previewUrl:
                typeof gif['previewUrl'] === 'string'
                    ? gif['previewUrl']
                    : undefined,
            alt:
                typeof gif['alt'] === 'string'
                    ? gif['alt']
                    : title || 'GIF',
            source: 'local',
        };
    }

    private mapMessageReactions(value: unknown): MessageReaction[] {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map((reaction): MessageReaction | undefined => {
                if (!reaction || typeof reaction !== 'object') {
                    return undefined;
                }

                const reactionData = reaction as Record<string, unknown>;
                const emoji = String(reactionData['emoji'] ?? '');
                const userUids = Array.isArray(reactionData['userUids'])
                    ? reactionData['userUids'].filter(
                        (uid): uid is string => typeof uid === 'string'
                    )
                    : [];

                if (!emoji || !userUids.length) {
                    return undefined;
                }

                const mappedReaction: MessageReaction = {
                    emoji,
                    userUids,
                };
                const updatedAt = this.toDate(reactionData['updatedAt']);

                if (updatedAt) {
                    mappedReaction.updatedAt = updatedAt;
                }

                return mappedReaction;
            })
            .filter((reaction): reaction is MessageReaction => !!reaction);
    }

    private toggleReaction(
        reactions: MessageReaction[],
        uid: string,
        emoji: string
    ) {
        const hadSelectedReaction = reactions.some(
            (reaction) =>
                reaction.emoji === emoji && reaction.userUids.includes(uid)
        );
        const reactionsWithoutUser = reactions
            .map((reaction) => ({
                ...reaction,
                userUids: reaction.userUids.filter((userUid) => userUid !== uid),
                updatedAt: new Date(),
            }))
            .filter((reaction) => reaction.userUids.length > 0);

        if (hadSelectedReaction) {
            return reactionsWithoutUser;
        }

        const existingReaction = reactionsWithoutUser.find(
            (reaction) => reaction.emoji === emoji
        );

        if (existingReaction) {
            return reactionsWithoutUser.map((reaction) =>
                reaction.emoji === emoji
                    ? {
                        ...reaction,
                        userUids: [...new Set([...reaction.userUids, uid])],
                        updatedAt: new Date(),
                    }
                    : reaction
            );
        }

        return [
            ...reactionsWithoutUser,
            {
                emoji,
                userUids: [uid],
                updatedAt: new Date(),
            },
        ];
    }

    private emptyConversationPreview(): ConversationPreviewData {
        return {
            hasMessages: false,
            isLastMessageMine: false,
            lastMessage: '',
            unreadCount: 0,
        };
    }

    private mapLastMessage(value: unknown) {
        if (!value || typeof value !== 'object') {
            return null;
        }

        const lastMessage = value as {
            senderUid?: unknown;
            text?: unknown;
        };

        return {
            senderUid: String(lastMessage.senderUid ?? ''),
            text: String(lastMessage.text ?? ''),
        };
    }

    private toRecord(value: unknown): Record<string, unknown> {
        return value && typeof value === 'object'
            ? (value as Record<string, unknown>)
            : {};
    }

    private toDate(value: unknown) {
        if (!value) {
            return undefined;
        }

        if (value instanceof Date) {
            return value;
        }

        if (typeof value === 'object') {
            const maybeTimestamp = value as { toDate?: () => Date };

            if (typeof maybeTimestamp.toDate === 'function') {
                return maybeTimestamp.toDate();
            }
        }

        if (typeof value === 'string' || typeof value === 'number') {
            const date = new Date(value);

            return Number.isNaN(date.getTime()) ? undefined : date;
        }

        return undefined;
    }

    private isTypingTimestampActive(value: unknown) {
        const date = this.toDate(value);

        if (!date) {
            return false;
        }

        return Date.now() - date.getTime() < 8 * 1000;
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
