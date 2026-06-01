import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
    Firestore,
    addDoc,
    collection,
    serverTimestamp,
} from '@angular/fire/firestore';

export type NotificationType = 'new_message' | 'new_match';

type NotificationPayload = {
    type: NotificationType;
    actorUid: string;
    title: string;
    body: string;
    conversationId?: string;
};

@Injectable({
    providedIn: 'root',
})
export class NotificationsRepository {
    private injector = inject(Injector);
    private firestore = inject(Firestore);

    notifyNewMessage(
        recipientUid: string,
        actorUid: string,
        conversationId: string,
        messagePreview: string
    ) {
        return this.createNotification(recipientUid, {
            type: 'new_message',
            actorUid,
            conversationId,
            title: 'New message',
            body: messagePreview.slice(0, 120),
        });
    }

    notifyNewMatch(recipientUid: string, actorUid: string) {
        return this.createNotification(recipientUid, {
            type: 'new_match',
            actorUid,
            title: 'New match',
            body: 'You have a new match on Amor.',
        });
    }

    private async createNotification(
        recipientUid: string,
        payload: NotificationPayload
    ) {
        if (!recipientUid || !payload.actorUid || recipientUid === payload.actorUid) {
            return;
        }

        await this.runInFirebaseContext(() => {
            const notificationsCollection = collection(
                this.firestore,
                `users/${recipientUid}/notifications`
            );

            return addDoc(notificationsCollection, {
                ...payload,
                isRead: false,
                createdAt: serverTimestamp(),
            });
        });
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
