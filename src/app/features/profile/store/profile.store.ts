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
    profileCreated: boolean;
    loading: boolean;
    error: string | null;
};

const initialState: ProfileState = {
    profile: null,
    profileCreated: false,
    loading: false,
    error: null,
};

function toUserClass(profile: UserClass | null) {
    if (profile) {
        Object.setPrototypeOf(profile, UserClass.prototype);
    }

    return profile;
}

export const ProfileStore = signalStore(
    {
        providedIn: 'root',
    },

    withState(initialState),

    withComputed((store) => ({
        hasProfile: computed(() => !!store.profile()),
        firstName: computed(() => store.profile()?.firstName ?? ''),
        uid: computed(() => store.profile()?.uid ?? null),
    })),

    withMethods((store, repository = inject(ProfileRepository)) => ({
        setProfile(profile: UserClass | null) {
            patchState(store, {
                profile: toUserClass(profile),
            });
        },

        setProfileCreated(profileCreated: boolean) {
            patchState(store, {
                profileCreated,
            });
        },

        async loadProfile(uid: string) {
            if (!uid) {
                patchState(store, {
                    profile: null,
                    profileCreated: false,
                    loading: false,
                    error: null,
                });
                return;
            }

            patchState(store, {
                loading: true,
                error: null,
            });

            try {
                const profile = await repository.getProfile(uid);

                patchState(store, {
                    profile: toUserClass(profile ?? null),
                    profileCreated: !!profile,
                    loading: false,
                });
            } catch (error) {
                console.error(error);

                patchState(store, {
                    loading: false,
                    error: 'Failed to load profile',
                });
            }
        },

        async createProfile(uid: string, profile: Partial<UserClass>) {
            patchState(store, {
                loading: true,
                error: null,
            });

            try {
                await repository.createProfile(uid, profile);

                const createdProfile = toUserClass({
                        uid,
                        ...profile,
                    } as UserClass);

                patchState(store, {
                    profile: createdProfile,
                    profileCreated: true,
                    loading: false,
                });
            } catch (error) {
                console.error(error);

                patchState(store, {
                    loading: false,
                    error: 'Failed to create profile',
                });
            }
        },

        async updateProfile(uid: string, profile: Partial<UserClass>) {
            patchState(store, {
                loading: true,
                error: null,
            });

            try {
                await repository.updateProfile(uid, profile);

                const updatedProfile = toUserClass({
                        ...(store.profile() ?? {}),
                        ...profile,
                    } as UserClass);

                patchState(store, {
                    profile: updatedProfile,
                    profileCreated: true,
                    loading: false,
                });
            } catch (error) {
                console.error(error);

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
