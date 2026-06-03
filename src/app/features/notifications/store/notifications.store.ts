import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { NotificationsRepository } from '../data-access/notifications.repository';
import { initialState } from './notifications.slice';


export const NotificationsStore = signalStore(
    { providedIn: 'root' },

    withState(initialState),

    withMethods((store, repository = inject(NotificationsRepository)) => ({
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

        reset() {
            patchState(store, initialState);
        },
    }))
);