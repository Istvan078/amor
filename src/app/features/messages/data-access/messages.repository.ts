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
    serverTimestamp,
    setDoc,
    where,
    writeBatch,
} from '@angular/fire/firestore';

import { Message } from '../../../shared/models/message.model';

export type ConversationPreviewData = {
    hasMessages: boolean;
    isLastMessageMine: boolean;
    lastMessage: string;
    unreadCount: number;
};

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
                limit(30)
            );

            return onSnapshot(
                messagesQuery,
                (snapshot) => {
                    onMessages(
                        snapshot.docs
                            .map((messageSnapshot) =>
                                this.mapConversationMessage(messageSnapshot.data())
                            )
                            .reverse()
                    );
                },
                (error) => onError?.(error)
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
                            text: lastMessage.message,
                            number: lastMessage.number,
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
                        text: message.message,
                        number: message.number,
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
                limit(30)
            );

            return getDocs(messagesQuery);
        });

        return snapshot.docs
            .map((messageSnapshot) =>
                this.mapConversationMessage(messageSnapshot.data())
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
            number: message.number,
            sentAt: message.sentAt ?? serverTimestamp(),
            readAt: message.readAt ?? null,
            isRead: message.isRead ?? false,
            attachments: message.attachments ?? [],
            isDeleted: message.isDeleted ?? false,
            isStarred: message.isStarred ?? false,
            isEdited: message.isEdited ?? false,
        };
    }

    private mapConversationMessage(data: Record<string, unknown>) {
        const message = new Message();

        message.senderUid = String(data['senderUid'] ?? '');
        message.sentToUid = String(data['sentToUid'] ?? '');
        message.message = String(data['text'] ?? data['message'] ?? '');
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

        return message;
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

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
