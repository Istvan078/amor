import { computed, inject } from '@angular/core';
import type { User } from '@angular/fire/auth';
import {
    patchState,
    signalStore,
    withComputed,
    withMethods,
    withState,
} from '@ngrx/signals';
import { firstValueFrom, Subscription } from 'rxjs';

import { AuthRepository } from '../data-access/auth.repository';
import { AuthUser, initialState, UserClaims } from './auth.slice';

export const AuthStore = signalStore(
    {
        providedIn: 'root',
    },

    withState(initialState),

    withComputed((store) => ({
        isLoggedIn: computed(() => !!store.user()?.uid),
        hasClaims: computed(() => !!store.claims()),
        uid: computed(() => store.user()?.uid ?? null),
        email: computed(() => store.user()?.email ?? null),
        emailVerified: computed(() => store.user()?.emailVerified === true),
        canModerate: computed(() => {
            const claims = store.claims() ?? store.user()?.claims;

            return claims?.admin === true || claims?.moderator === true;
        }),
    })),

    withMethods((store, repository = inject(AuthRepository)) => {
        let authListenerStarted = false;
        let authSubscription = Subscription.EMPTY;
        const readyResolvers: Array<() => void> = [];

        function resolveReady() {
            while (readyResolvers.length) {
                readyResolvers.shift()?.();
            }
        }

        async function loadClaimsForUser(user: AuthUser) {
            const claims = await firstValueFrom(
                repository.getClaims(user.uid, user.idToken)
            );

            const nextUser = {
                ...user,
                claims,
            };

            patchState(store, {
                user: nextUser,
                claims,
            });

            return nextUser;
        }

        async function loadUsersForUser(user: AuthUser) {
            const claims = user.claims ?? store.claims();

            if (claims?.admin !== true && claims?.moderator !== true) {
                patchState(store, {
                    users: [],
                });

                return [];
            }

            const users = await firstValueFrom(repository.getUsers(user.idToken));

            patchState(store, {
                users: users ?? [],
            });

            return users ?? [];
        }

        async function setFirebaseUser(firebaseUser: User | null) {
            if (!firebaseUser) {
                patchState(store, {
                    user: null,
                    claims: null,
                    users: [],
                    initialized: true,
                    loading: false,
                    error: null,
                });
                resolveReady();
                return null;
            }

            const user = await repository.createAuthUser(firebaseUser);

            patchState(store, {
                user,
                claims: null,
                initialized: true,
                loading: false,
                error: null,
            });

            resolveReady();

            const userWithClaims = await loadClaimsForUser(user);
            await loadUsersForUser(userWithClaims);

            return userWithClaims;
        }

        function startAuthListener() {
            if (authListenerStarted) {
                return;
            }

            authListenerStarted = true;
            authSubscription = repository.user$.subscribe({
                next: (firebaseUser) => {
                    void setFirebaseUser(firebaseUser);
                },
                error: (error) => {
                    console.error(error);
                    patchState(store, {
                        initialized: true,
                        loading: false,
                        error: 'Authentication listener failed.',
                    });
                    resolveReady();
                },
            });
        }

        return {
            startAuthListener,

            async waitForAuthReady() {
                if (!authListenerStarted) {
                    startAuthListener();
                }

                if (store.initialized()) {
                    return;
                }

                await new Promise<void>((resolve) => readyResolvers.push(resolve));
            },

            async registerEmail(data: { email: string; password: string }) {
                patchState(store, {
                    loading: true,
                    error: null,
                });

                try {
                    const userCredentials = await repository.registerWithEmail(data);
                    const user = await setFirebaseUser(userCredentials.user);

                    try {
                        await repository.sendVerificationEmail();
                    } catch (verificationError) {
                        console.warn(
                            'Registration completed, but verification email failed.',
                            verificationError
                        );
                    }

                    return {
                        ...userCredentials,
                        user: userCredentials.user,
                        appUser: user,
                    };
                } catch (error) {
                    console.error(error);
                    patchState(store, {
                        loading: false,
                        error: 'Registration failed.',
                    });
                    throw error;
                }
            },

            async signInWithEmail(data: { email: string; password: string }) {
                patchState(store, {
                    loading: true,
                    error: null,
                });

                try {
                    const userCredentials = await repository.signInWithEmail(data);
                    const user = await setFirebaseUser(userCredentials.user);

                    return {
                        ...userCredentials,
                        user: userCredentials.user,
                        appUser: user,
                    };
                } catch (error) {
                    console.error(error);
                    patchState(store, {
                        loading: false,
                        error: 'Login failed.',
                    });
                    throw error;
                }
            },

            async signOut() {
                await repository.signOut();
                patchState(store, {
                    user: null,
                    claims: null,
                    users: [],
                    loading: false,
                    error: null,
                });
            },

            sendVerificationEmail() {
                return repository.sendVerificationEmail();
            },

            async refreshCurrentUser() {
                const refreshedUser = await repository.refreshCurrentUser();

                if (!refreshedUser) {
                    return null;
                }

                const nextUser = {
                    ...refreshedUser,
                    claims: store.claims(),
                };

                patchState(store, {
                    user: nextUser,
                });

                return nextUser;
            },

            async loadUsersForLoggedUser() {
                const user = store.user();

                if (!user) {
                    patchState(store, {
                        users: [],
                    });
                    return [];
                }

                return loadUsersForUser(user);
            },

            async setCustomClaims(uid: string) {
                const user = store.user();

                if (!user?.idToken) {
                    return;
                }

                await firstValueFrom(
                    repository.setCustomClaims(uid, user.idToken)
                );

                const currentClaims = store.claims() ?? user.claims ?? {};
                const nextClaims: UserClaims = {
                    ...(currentClaims.admin === true ? { admin: true } : {}),
                    ...(currentClaims.moderator === true ? { moderator: true } : {}),
                    ...(currentClaims.premiumAccess === true
                        ? { premiumAccess: true }
                        : {}),
                };

                const nextUser = {
                    ...user,
                    claims: nextClaims,
                };

                patchState(store, {
                    user: nextUser,
                    claims: nextClaims,
                });
            },

            setUser(user: AuthUser | null) {
                patchState(store, {
                    user,
                    claims: user?.claims ?? null,
                });
            },

            setAutoFillEmail(email: string | null | undefined) {
                patchState(store, {
                    autoFillEmail: email ?? null,
                });
            },

            async deleteUser(uid?: string) {
                patchState(store, {
                    loading: true,
                    error: null,
                });

                try {
                    await repository.deleteUser(uid);
                    patchState(store, {
                        user: null,
                        claims: null,
                        users: [],
                        loading: false,
                        error: null,
                    });
                } catch (error) {
                    console.error(error);
                    patchState(store, {
                        loading: false,
                        error: 'Account deletion failed.',
                    });
                    throw error;
                }
            },

            clearUsers() {
                patchState(store, {
                    users: [],
                });
            },

            stopAuthListener() {
                authSubscription.unsubscribe();
                authListenerStarted = false;
            },
        };
    }),
);
