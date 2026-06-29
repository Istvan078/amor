import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
    Firestore,
    collection,
    deleteField,
    doc,
    getDoc,
    getDocs,
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
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
    Message,
    MessageGif,
    MessageReaction,
} from '../../../shared/models/message.model';
import { AuthStore } from '../../auth/store/auth.store';

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
    private http = inject(HttpClient);
    private authStore = inject(AuthStore);

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

                    onPreview(
                        this.mapConversationPreview(
                            snapshot.data() as Record<string, unknown>,
                            myUid
                        )
                    );
                },
                (error) => onError?.(error)
            );
        });
    }

    listenToConversationPreviews(
        myUid: string,
        onPreviews: (previews: Record<string, ConversationPreviewData>) => void,
        onError?: (error: unknown) => void,
        pageSize = 80
    ) {
        return this.runInFirebaseContext(() => {
            const conversationsCollection = collection(this.firestore, 'conversations');
            const conversationsQuery = query(
                conversationsCollection,
                where('participants', 'array-contains', myUid),
                orderBy('updatedAt', 'desc'),
                limit(pageSize)
            );

            return onSnapshot(
                conversationsQuery,
                (snapshot) => {
                    const previews: Record<string, ConversationPreviewData> = {};

                    snapshot.docs.forEach((conversationSnapshot) => {
                        const data = conversationSnapshot.data() as Record<string, unknown>;
                        const matchUid = this.getOtherParticipantUid(data, myUid);

                        if (!matchUid) {
                            return;
                        }

                        previews[matchUid] = this.mapConversationPreview(data, myUid);
                    });

                    onPreviews(previews);
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

        return this.runInFirebaseContext(async () => {
            const conversationRef = doc(
                this.firestore,
                `conversations/${conversationId}`
            );
            const conversationSnapshot = await getDoc(conversationRef);

            if (!conversationSnapshot.exists()) {
                await setDoc(
                    conversationRef,
                    {
                        participants,
                        typing: {
                            [myUid]: isTyping ? serverTimestamp() : null,
                        },
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                );
                return;
            }

            await setDoc(
                conversationRef,
                {
                    typing: {
                        [myUid]: isTyping ? serverTimestamp() : null,
                    },
                },
                { merge: true }
            );
        });
    }

    async sendMessageWithMatch(
        myUid: string,
        matchUid: string,
        message: Message
    ): Promise<string> {
        const idToken = await this.getIdToken();

        if (!idToken) {
            throw new Error('messages.authRequired');
        }

        const response = await firstValueFrom(
            this.http.post<{ messageId: string }>(
                `${environment.API_URL}sendMessage`,
                {
                    uid: myUid,
                    matchUid,
                    text: message.message,
                    type: message.messageType ?? 'text',
                    gif: message.gif ?? null,
                },
                {
                    headers: new HttpHeaders().set('Authorization', idToken),
                }
            )
        );

        return response.messageId;
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
                const hadSelectedReaction = currentReactions.some(
                    (reaction) =>
                        reaction.emoji === emoji && reaction.userUids.includes(myUid)
                );
                const reactions = this.toggleReaction(currentReactions, myUid, emoji);

                transaction.update(messageRef, {
                    [`reactions.${myUid}`]: hadSelectedReaction
                        ? deleteField()
                        : {
                            emoji,
                            updatedAt: serverTimestamp(),
                        },
                });

                return reactions;
            });
        });
    }

    async editMessage(
        myUid: string,
        matchUid: string,
        message: Message,
        nextText: string
    ) {
        if (!message.id || message.senderUid !== myUid || message.isDeleted) {
            return;
        }

        const conversationId = this.getConversationId(myUid, matchUid);
        const trimmedText = nextText.trim();

        if (!trimmedText) {
            return;
        }

        await this.runInFirebaseContext(async () => {
            const messageRef = doc(
                this.firestore,
                `conversations/${conversationId}/messages/${message.id}`
            );
            const editedAt = serverTimestamp();

            await runTransaction(this.firestore, async (transaction) => {
                transaction.update(messageRef, {
                    text: trimmedText,
                    type: 'text',
                    gif: null,
                    attachments: [],
                    isEdited: true,
                    editedAt,
                });
            });
        });
    }

    async deleteMessage(myUid: string, matchUid: string, message: Message) {
        if (!message.id || message.senderUid !== myUid || message.isDeleted) {
            return;
        }

        const conversationId = this.getConversationId(myUid, matchUid);

        await this.runInFirebaseContext(async () => {
            const messageRef = doc(
                this.firestore,
                `conversations/${conversationId}/messages/${message.id}`
            );
            const deletedAt = serverTimestamp();

            await runTransaction(this.firestore, async (transaction) => {
                transaction.update(messageRef, {
                    text: '',
                    type: 'text',
                    gif: null,
                    attachments: [],
                    reactions: {},
                    isDeleted: true,
                    isEdited: false,
                    deletedAt,
                });
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

    private getOtherParticipantUid(
        conversation: Record<string, unknown>,
        myUid: string
    ) {
        const participants = Array.isArray(conversation['participants'])
            ? conversation['participants'].filter(
                (uid): uid is string => typeof uid === 'string' && !!uid
            )
            : [];

        return participants.find((uid) => uid !== myUid) ?? '';
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
        message.editedAt = this.toDate(data['editedAt']);
        message.deletedAt = this.toDate(data['deletedAt']);
        message.gif = this.mapMessageGif(data['gif']);
        message.reactions = this.mapMessageReactions(data['reactions']);

        return message;
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
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const groupedReactions = new Map<string, MessageReaction>();

            Object.entries(value as Record<string, unknown>).forEach(([uid, reaction]) => {
                if (!uid || !reaction || typeof reaction !== 'object') {
                    return;
                }

                const reactionData = reaction as Record<string, unknown>;
                const emoji = String(reactionData['emoji'] ?? '');

                if (!emoji) {
                    return;
                }

                const updatedAt = this.toDate(reactionData['updatedAt']);
                const existingReaction = groupedReactions.get(emoji);

                if (existingReaction) {
                    existingReaction.userUids = [
                        ...new Set([...existingReaction.userUids, uid]),
                    ];

                    if (
                        updatedAt &&
                        (!existingReaction.updatedAt ||
                            updatedAt.getTime() > existingReaction.updatedAt.getTime())
                    ) {
                        existingReaction.updatedAt = updatedAt;
                    }

                    return;
                }

                groupedReactions.set(emoji, {
                    emoji,
                    userUids: [uid],
                    ...(updatedAt ? { updatedAt } : {}),
                });
            });

            return Array.from(groupedReactions.values());
        }

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

    private async getIdToken() {
        const user = this.authStore.user();
        const rawUser = user?.raw as
            | { getIdToken?: (forceRefresh?: boolean) => Promise<string> }
            | undefined;

        if (rawUser?.getIdToken) {
            return rawUser.getIdToken();
        }

        return user?.idToken;
    }

    private emptyConversationPreview(): ConversationPreviewData {
        return {
            hasMessages: false,
            isLastMessageMine: false,
            lastMessage: '',
            unreadCount: 0,
        };
    }

    private mapConversationPreview(
        data: Record<string, unknown>,
        myUid: string
    ): ConversationPreviewData {
        const lastMessage = this.mapLastMessage(data['lastMessage']);
        const unreadCounts = this.toRecord(data['unreadCounts']);

        return {
            hasMessages: !!lastMessage?.text,
            isLastMessageMine: lastMessage?.senderUid === myUid,
            lastMessage: lastMessage?.text ?? '',
            unreadCount: Number(unreadCounts[myUid] ?? 0),
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
