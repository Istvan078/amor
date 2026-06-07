import { computed, inject } from '@angular/core';
import {
    patchState,
    signalStore,
    withComputed,
    withMethods,
    withState,
} from '@ngrx/signals';

import { UserClass } from '../../../shared/models/user.model';
import { AuthStore } from '../../auth/store/auth.store';
import { MatchIndexRepository } from '../../matching/data-access/match-index.repository';
import { ProfileRepository } from '../data-access/profile.repository';

type ProfileState = {
    profile: UserClass | null;
    profileCreated: boolean;
    profileDeleted: boolean;
    loading: boolean;
    error: string | null;
};

const initialState: ProfileState = {
    profile: null,
    profileCreated: false,
    profileDeleted: false,
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

    withMethods((
        store,
        repository = inject(ProfileRepository),
        matchIndexRepository = inject(MatchIndexRepository),
        authStore = inject(AuthStore)
    ) => {
        async function syncProfileIndex(profile: Partial<UserClass> & { uid: string }) {
            try {
                await matchIndexRepository.upsertProfileIndex(profile);
            } catch (error) {
                console.warn('Profile was saved, but index sync failed.', error);
            }
        }

        return {
        setProfile(profile: UserClass | null) {
            patchState(store, {
                profile: toUserClass(profile),
                ...(profile ? { profileDeleted: false } : {}),
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
                    profileDeleted: false,
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
                await syncProfileIndex({
                    uid,
                    ...profile,
                });

                const createdProfile = toUserClass({
                    uid,
                    ...profile,
                } as UserClass);

                patchState(store, {
                    profile: createdProfile,
                    profileCreated: true,
                    profileDeleted: false,
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
                await syncProfileIndex({
                    ...(store.profile() ?? {}),
                    ...profile,
                    uid,
                });

                const updatedProfile = toUserClass({
                    ...(store.profile() ?? {}),
                    ...profile,
                } as UserClass);

                patchState(store, {
                    profile: updatedProfile,
                    profileCreated: true,
                    profileDeleted: false,
                    loading: false,
                });

                return true;
            } catch (error) {
                console.error(error);

                patchState(store, {
                    loading: false,
                    error: 'Failed to update profile',
                });

                return false;
            }
        },

        async deleteProfile(uid: string) {
            patchState(store, {
                loading: true,
                error: null,
            });

            try {
                await authStore.deleteUser(uid);
                patchState(store, {
                    profile: null,
                    profileCreated: false,
                    profileDeleted: true,
                    loading: false,
                    error: null,
                });

                return true;
            } catch (error) {
                console.error(error)
                patchState(store, {
                    loading: false,
                    error: "Failed to delete profile"
                })

                return false;
            }
        },

        clearProfile() {
            patchState(store, initialState);
        },
        };
    })
);
