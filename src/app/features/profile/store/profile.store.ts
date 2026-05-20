import { computed, inject } from '@angular/core';
import {
    patchState,
    signalStore,
    withComputed,
    withMethods,
    withState,
} from '@ngrx/signals';

import { UserClass } from '../../../shared/models/user.model';
import { ProfileRepository } from '../data-access/profile.repository';

type ProfileState = {
    profile: UserClass | null;
    loading: boolean;
    error: string | null;
};

const initialState: ProfileState = {
    profile: null,
    loading: false,
    error: null,
};

export const ProfileStore = signalStore(
    { providedIn: 'root' },

    withState(initialState),

    withComputed((store) => ({
        hasProfile: computed(() => !!store.profile()),
        firstName: computed(() => store.profile()?.firstName ?? ''),
    })),

    withMethods((store, repository = inject(ProfileRepository)) => ({
        async loadProfile(uid: string) {
            patchState(store, { loading: true, error: null });

            try {
                const profile = await repository.getProfile(uid);
                patchState(store, { profile: profile ?? null, loading: false });
            } catch (error) {
                patchState(store, {
                    loading: false,
                    error: 'Failed to load profile',
                });
            }
        },

        async updateProfile(uid: string, profile: Partial<UserClass>) {
            patchState(store, { loading: true, error: null });

            try {
                await repository.updateProfile(uid, profile);
                patchState(store, {
                    profile: {
                        ...(store.profile() ?? {}),
                        ...profile,
                    } as UserClass,
                    loading: false,
                });
            } catch (error) {
                patchState(store, {
                    loading: false,
                    error: 'Failed to update profile',
                });
            }
        },

        clearProfile() {
            patchState(store, initialState);
        },
    }))
);