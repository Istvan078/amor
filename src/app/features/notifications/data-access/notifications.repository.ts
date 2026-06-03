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
    doc,
    serverTimestamp,
    setDoc,
} from '@angular/fire/firestore';

@Injectable({
    providedIn: 'root',
})
export class NotificationsRepository {
    private firestore = inject(Firestore);
    private injector = inject(Injector);

    private listenersRegistered = false;

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

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}