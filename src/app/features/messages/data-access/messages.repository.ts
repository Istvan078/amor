import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
    Firestore,
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    writeBatch,
} from '@angular/fire/firestore';

import { Message, Messages } from '../../../shared/models/message.model';

@Injectable({
    providedIn: 'root',
})
export class MessagesRepository {
    private injector = inject(Injector);
    private firestore = inject(Firestore);

    async getMessages(
        myUid: string,
        myEmail: string,
        matchUid: string,
        matchEmail: string
    ) {
        const conversationMessages = await this.getConversationMessages(
            myUid,
            matchUid
        );

        if (conversationMessages.length) {
            return conversationMessages;
        }

        return this.getLegacyMessages(myUid, myEmail, matchUid, matchEmail);
    }

    async saveMessagesWithMatch(
        myUid: string,
        myEmail: string,
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

        await this.saveLegacyMessagesWithMatch(myUid, myEmail, matchUid, messages);
    }

    private async getConversationMessages(myUid: string, matchUid: string) {
        const conversationId = this.getConversationId(myUid, matchUid);

        const snapshot = await this.runInFirebaseContext(() => {
            const messagesCollection = collection(
                this.firestore,
                `conversations/${conversationId}/messages`
            );
            const messagesQuery = query(messagesCollection, orderBy('number', 'asc'));

            return getDocs(messagesQuery);
        });

        return snapshot.docs.map((messageSnapshot) =>
            this.mapConversationMessage(messageSnapshot.data())
        );
    }

    private async getLegacyMessages(
        myUid: string,
        myEmail: string,
        matchUid: string,
        matchEmail: string
    ) {
        const msgsCopy: Messages = new Messages([]);

        const [myMessageSnapshot, matchMessageSnapshot] =
            await this.runInFirebaseContext(() => {
                const myMessageRef = doc(
                    this.firestore,
                    `matches/messages/${myEmail}/${matchUid}_${myUid}`
                );

                const matchMessageRef = doc(
                    this.firestore,
                    `matches/messages/${matchEmail}/${myUid}_${matchUid}`
                );

                return Promise.all([
                    getDoc(myMessageRef),
                    getDoc(matchMessageRef),
                ]);
            });

        const myMsgs = myMessageSnapshot.exists()
            ? (myMessageSnapshot.data() as Message)
            : undefined;

        const matchMsgs = matchMessageSnapshot.exists()
            ? (matchMessageSnapshot.data() as Message)
            : undefined;

        const allMsgs: any = {
            ...(myMsgs ?? {}),
            ...(matchMsgs ?? {}),
        };

        msgsCopy.messages = Object.values(allMsgs).flat() as Message[];
        msgsCopy.messages.sort((a, b) => a.number - b.number);

        return msgsCopy.messages;
    }

    private async saveLegacyMessagesWithMatch(
        myUid: string,
        myEmail: string,
        matchUid: string,
        messages: Message[]
    ) {
        await this.runInFirebaseContext(() => {
            const messageRef = doc(
                this.firestore,
                `matches/messages/${myEmail}/${matchUid}_${myUid}`
            );

            return setDoc(messageRef, new Messages(messages).setMessagesForFirestore(), {
                merge: true,
            });
        });
    }

    private getConversationId(uidA: string, uidB: string) {
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
