// import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
// import {
//     Firestore,
//     addDoc,
//     collection,
//     serverTimestamp,
// } from '@angular/fire/firestore';

// export type NotificationType = 'new_message' | 'new_match';

// type NotificationPayload = {
//     type: NotificationType;
//     actorUid: string;
//     title: string;
//     body: string;
//     conversationId?: string;
// };

// @Injectable({
//     providedIn: 'root',
// })
// export class NotificationsRepository {
//     private injector = inject(Injector);
//     private firestore = inject(Firestore);

//     notifyNewMessage(
//         recipientUid: string,
//         actorUid: string,
//         conversationId: string,
//         messagePreview: string
//     ) {
//         return this.createNotification(recipientUid, {
//             type: 'new_message',
//             actorUid,
//             conversationId,
//             title: 'New message',
//             body: messagePreview.slice(0, 120),
//         });
//     }

//     notifyNewMatch(recipientUid: string, actorUid: string) {
//         return this.createNotification(recipientUid, {
//             type: 'new_match',
//             actorUid,
//             title: 'New match',
//             body: 'You have a new match on Amor.',
//         });
//     }

//     private async createNotification(
//         recipientUid: string,
//         payload: NotificationPayload
//     ) {
//         if (!recipientUid || !payload.actorUid || recipientUid === payload.actorUid) {
//             return;
//         }

//         await this.runInFirebaseContext(() => {
//             const notificationsCollection = collection(
//                 this.firestore,
//                 `users/${recipientUid}/notifications`
//             );

//             return addDoc(notificationsCollection, {
//                 ...payload,
//                 isRead: false,
//                 createdAt: serverTimestamp(),
//             });
//         });
//     }

//     private runInFirebaseContext<T>(callback: () => T): T {
//         return runInInjectionContext(this.injector, callback);
//     }
// }

import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import {
    Firestore,
    collection,
    doc,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    writeBatch,
} from '@angular/fire/firestore';

export type AppNotificationType =
    | 'new_message'
    | 'new_match'
    | 'super_like'
    | 'promotion'
    | 'profile_boost_ended'
    | 'premium_expiry'
    | 'report_status';

export type AppNotification = {
    id: string;
    type: AppNotificationType;
    actorUid?: string;
    title: string;
    body: string;
    conversationId?: string;
    isRead: boolean;
    createdAt?: Date;
};

@Injectable({
    providedIn: 'root',
})
export class NotificationsRepository {
    private firestore = inject(Firestore);
    private injector = inject(Injector);

    private listenersRegistered = false;

    listenToNotifications(
        uid: string,
        onNotifications: (notifications: AppNotification[]) => void,
        onError?: (error: unknown) => void
    ) {
        return this.runInFirebaseContext(() => {
            const notificationsCollection = collection(
                this.firestore,
                `users/${uid}/notifications`
            );
            const notificationsQuery = query(
                notificationsCollection,
                orderBy('createdAt', 'desc'),
                limit(30)
            );

            return onSnapshot(
                notificationsQuery,
                (snapshot) => {
                    onNotifications(
                        snapshot.docs.map((docSnapshot) =>
                            this.mapNotification(docSnapshot.id, docSnapshot.data())
                        )
                    );
                },
                (error) => {
                    onError?.(error);
                }
            );
        });
    }

    async markAsRead(uid: string, notificationId: string) {
        if (!uid || !notificationId) {
            return;
        }

        return this.runInFirebaseContext(() => {
            const notificationRef = doc(
                this.firestore,
                `users/${uid}/notifications/${notificationId}`
            );

            return updateDoc(notificationRef, {
                isRead: true,
            });
        });
    }

    async markAllAsRead(uid: string, notificationIds: string[]) {
        if (!uid || !notificationIds.length) {
            return;
        }

        return this.runInFirebaseContext(() => {
            const batch = writeBatch(this.firestore);

            notificationIds.forEach((notificationId) => {
                const notificationRef = doc(
                    this.firestore,
                    `users/${uid}/notifications/${notificationId}`
                );
                batch.update(notificationRef, {
                    isRead: true,
                });
            });

            return batch.commit();
        });
    }

    async init(uid: string) {
        if (!uid || !Capacitor.isNativePlatform()) {
            return { registered: false, reason: 'not_native' as const };
        }

        if (!this.listenersRegistered) {
            this.listenersRegistered = true;

            await PushNotifications.addListener('registration', async (token) => {
                await this.saveToken(uid, token.value);
            });

            await PushNotifications.addListener('registrationError', (error) => {
                console.error('Push registration error:', error);
            });

            await PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('Push received:', notification);
            });

            await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
                console.log('Push action performed:', action);
            });
        }

        let permission = await PushNotifications.checkPermissions();

        if (permission.receive === 'prompt') {
            permission = await PushNotifications.requestPermissions();
        }

        if (permission.receive !== 'granted') {
            return { registered: false, reason: 'permission_denied' as const };
        }

        await PushNotifications.register();

        return { registered: true, reason: null };
    }

    private async saveToken(uid: string, token: string) {
        return this.runInFirebaseContext(() => {
            const tokenRef = doc(this.firestore, `users/${uid}/pushTokens/${token}`);

            return setDoc(
                tokenRef,
                {
                    token,
                    platform: 'android',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
        });
    }

    private mapNotification(id: string, data: Record<string, unknown>): AppNotification {
        return {
            id,
            type: this.toNotificationType(data['type']),
            actorUid: typeof data['actorUid'] === 'string' ? data['actorUid'] : undefined,
            title: typeof data['title'] === 'string' ? data['title'] : 'Notification',
            body: typeof data['body'] === 'string' ? data['body'] : '',
            conversationId:
                typeof data['conversationId'] === 'string'
                    ? data['conversationId']
                    : undefined,
            isRead: data['isRead'] === true,
            createdAt: this.toDate(data['createdAt']),
        };
    }

    private toNotificationType(value: unknown): AppNotificationType {
        if (
            value === 'new_message' ||
            value === 'new_match' ||
            value === 'super_like' ||
            value === 'promotion' ||
            value === 'profile_boost_ended' ||
            value === 'premium_expiry' ||
            value === 'report_status'
        ) {
            return value;
        }

        return 'new_message';
    }

    private toDate(value: unknown): Date | undefined {
        if (!value) {
            return undefined;
        }

        if (value instanceof Date) {
            return value;
        }

        if (
            typeof value === 'object' &&
            'toDate' in value &&
            typeof value.toDate === 'function'
        ) {
            return value.toDate();
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
