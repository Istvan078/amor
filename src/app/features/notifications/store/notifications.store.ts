import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { NotificationsRepository } from '../data-access/notifications.repository';
import { initialState } from './notifications.slice';


export const NotificationsStore = signalStore(
    { providedIn: 'root' },

    withState(initialState),

    withComputed((store) => ({
        hasUnread: computed(() => store.unreadCount() > 0),
        hasRead: computed(() =>
            store.notifications().some((notification) => notification.isRead)
        ),
    })),

    withMethods((store, repository = inject(NotificationsRepository)) => {
        let activeUid: string | null = null;
        let unsubscribeNotifications: (() => void) | null = null;

        const stopListening = () => {
            unsubscribeNotifications?.();
            unsubscribeNotifications = null;
            activeUid = null;
        };

        return {
            start(uid: string) {
                if (!uid || activeUid === uid) {
                    return;
                }

                stopListening();
                activeUid = uid;

                unsubscribeNotifications = repository.listenToNotifications(
                    uid,
                    (notifications) => {
                        patchState(store, {
                            notifications,
                            unreadCount: notifications.filter(
                                (notification) => !notification.isRead
                            ).length,
                            error: null,
                        });
                    },
                    (error) => {
                        console.error(error);
                        patchState(store, {
                            error: 'Failed to load notifications.',
                        });
                    }
                );
            },

            async init(uid: string) {
                if (!uid || store.loading() || store.registered()) {
                    return;
                }

                patchState(store, {
                    loading: true,
                    error: null,
                });

                try {
                    const result = await repository.init(uid);

                    patchState(store, {
                        loading: false,
                        registered: result.registered,
                        error:
                            result.reason === 'permission_denied'
                                ? 'Notification permission was denied.'
                                : null,
                    });
                } catch (error) {
                    console.error(error);

                    patchState(store, {
                        loading: false,
                        registered: false,
                        error: 'Failed to register push notifications.',
                    });
                }
            },

            async markAsRead(notificationId: string) {
                if (!activeUid || !notificationId) {
                    return;
                }

                await repository.markAsRead(activeUid, notificationId);
            },

            async markAllAsRead() {
                if (!activeUid) {
                    return;
                }

                const unreadNotificationIds = store
                    .notifications()
                    .filter((notification) => !notification.isRead)
                    .map((notification) => notification.id);

                await repository.markAllAsRead(activeUid, unreadNotificationIds);
            },

            async deleteNotification(notificationId: string) {
                if (!activeUid || !notificationId) {
                    return;
                }

                await repository.deleteNotification(activeUid, notificationId);
            },

            async deleteReadNotifications() {
                if (!activeUid) {
                    return;
                }

                const readNotificationIds = store
                    .notifications()
                    .filter((notification) => notification.isRead)
                    .map((notification) => notification.id);

                await repository.deleteNotifications(activeUid, readNotificationIds);
            },

            reset() {
                stopListening();
                patchState(store, initialState);
            },
        };
    })
);
