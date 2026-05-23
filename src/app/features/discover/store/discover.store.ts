import { inject } from '@angular/core';
import {
    patchState,
    signalStore,
    withMethods,
    withState,
} from '@ngrx/signals';

import { AuthStore } from '../../auth/store/auth.store';
import { ProfileStore } from '../../profile/store/profile.store';
import { LocationService } from '../../../services/location.service';
import { MatchParts, UserClass } from '../../../shared/models/user.model';
import { DiscoverRepository } from '../data-access/discover.repository';
import { AuthUser, UserClaims } from '../../auth/store/auth.slice';

type DiscoverState = {
    loggedUser: any | null;
    userProfile: UserClass | null;
    possibleMatchIds: string[];
    matches: UserClass[];
    progress: number;
    buffer: number;
    loading: boolean;
    error: string | null;
};

const initialState: DiscoverState = {
    loggedUser: null,
    userProfile: null,
    possibleMatchIds: [],
    matches: [],
    progress: 0,
    buffer: 0,
    loading: false,
    error: null,
};

export const DiscoverStore = signalStore(
    {
        providedIn: 'root',
    },

    withState(initialState),

    withMethods((store) => {
        const authStore = inject(AuthStore);
        const profileStore = inject(ProfileStore);
        const locationService = inject(LocationService);
        const repository = inject(DiscoverRepository);

        async function getLoggedUser(): Promise<AuthUser | null> {
            await authStore.waitForAuthReady();

            if (authStore.user()) {
                return authStore.user();
            }

            return null;
        }

        async function getUsers() {
            if (authStore.users().length) {
                return authStore.users();
            }

            return authStore.loadUsersForLoggedUser();
        }

        async function getCurrentCity(position: any): Promise<string> {
            let locationDetails: any = await locationService.getLocName(position);

            if (locationDetails?.error) {
                locationDetails = await locationService.getLocName(position, true);
            }

            return (
                locationDetails?.city ??
                locationDetails?.address?.city ??
                locationDetails?.address?.town ??
                locationDetails?.address?.village ??
                ''
            );
        }

        function prepareUserProfile(profile: UserClass, uid: string) {
            Object.setPrototypeOf(profile, UserClass.prototype);

            if (!profile.uid) {
                profile.uid = uid;
            }

            if (!profile.matchParts) {
                profile.matchParts = new MatchParts();
            }

            if (!profile.age) {
                profile.calcAge();
            }

            return profile;
        }

        async function syncMutualMatches(userProfile: UserClass) {
            if (!userProfile.uid || !userProfile.matchParts?.liked?.length) {
                return;
            }

            for (const likedUid of userProfile.matchParts.liked) {
                const likedProfile = await repository.getUserProfile(likedUid);

                if (!likedProfile?.matchParts) {
                    continue;
                }

                const likedBack = likedProfile.matchParts.liked?.includes(
                    userProfile.uid
                );

                const alreadyMatched =
                    userProfile.matchParts.matches?.includes(likedUid);

                if (likedBack && !alreadyMatched) {
                    userProfile.matchParts.matches.push(likedUid);

                    userProfile.matchParts.liked =
                        userProfile.matchParts.liked.filter((uid) => uid !== likedUid);

                    likedProfile.matchParts.liked =
                        likedProfile.matchParts.liked.filter((uid) => uid !== userProfile.uid);

                    likedProfile.matchParts.matches.push(userProfile.uid);

                    await repository.updateUserProfile(likedUid, likedProfile);
                    await repository.updateUserProfile(
                        userProfile.uid,
                        userProfile.setDataForFireStore()
                    );
                }
            }
        }

        async function buildPossibleMatches(
            users: any[],
            loggedUser: any,
            userProfile: UserClass,
            currentCity: string,
            userPosition: any
        ) {
            const possibleMatchIds: string[] = [];
            const checkedUsers: string[] = [];

            userProfile.matchParts!.possMatches = [];

            const lookingForGender =
                loggedUser?.claims?.lookingForGender ?? userProfile.lookingForGender;

            const lookingForDistance =
                Number(
                    loggedUser?.claims?.lookingForDistance ??
                    userProfile.lookingForDistance ??
                    50
                );

            const filteredUsers = users.filter((user: any) => {
                if (!user?.uid || user.uid === userProfile.uid) {
                    return false;
                }

                return (
                    user?.claims?.gender === lookingForGender &&
                    user?.claims?.currentPlace &&
                    !userProfile.matchParts?.liked?.includes(user.uid) &&
                    !userProfile.matchParts?.notLiked?.includes(user.uid) &&
                    !userProfile.matchParts?.matches?.includes(user.uid)
                );
            });

            if (!filteredUsers.length) {
                patchState(store, {
                    progress: 100,
                });

                return possibleMatchIds;
            }

            for (const user of filteredUsers) {
                let matchLocation: any = await locationService.getCoordsGeocodeXYZ(
                    user.claims.currentPlace
                );

                if (matchLocation?.message) {
                    matchLocation = await locationService.getCoordinatesOSM(
                        user.claims.currentPlace
                    );
                }

                await locationService.delay(1000);

                const matchLat = Number(matchLocation?.lat ?? matchLocation?.latt);
                const matchLon = Number(matchLocation?.lon ?? matchLocation?.longt);

                if (!Number.isFinite(matchLat) || !Number.isFinite(matchLon)) {
                    checkedUsers.push(user.uid);

                    patchState(store, {
                        progress: Math.round(
                            (checkedUsers.length / filteredUsers.length) * 100
                        ),
                    });

                    continue;
                }

                const distanceBetweenUsers =
                    locationService.getDistanceBetweenPoints(
                        userPosition.coords.latitude,
                        userPosition.coords.longitude,
                        matchLat,
                        matchLon
                    );

                if (distanceBetweenUsers <= lookingForDistance) {
                    possibleMatchIds.push(user.uid);
                    userProfile.matchParts!.possMatches.push(user.uid);
                }

                checkedUsers.push(user.uid);

                patchState(store, {
                    progress: Math.round(
                        (checkedUsers.length / filteredUsers.length) * 100
                    ),
                });
            }

            userProfile.currentPlace = currentCity;

            if (userProfile.uid) {
                await repository.updateUserProfile(
                    userProfile.uid,
                    userProfile.setDataForFireStore()
                );
            }

            patchState(store, {
                progress: 100,
            });

            return possibleMatchIds;
        }

        function startProgressBuffer() {
            patchState(store, {
                buffer: 0,
            });

            const intervalRef = setInterval(() => {
                const nextBuffer = store.buffer() + 0.35;

                patchState(store, {
                    buffer: nextBuffer,
                });

                if (store.progress() > 25 || nextBuffer >= 100) {
                    clearInterval(intervalRef);
                }
            }, 200);
        }

        return {
            async loadDiscoverData() {
                patchState(store, {
                    loading: true,
                    error: null,
                    progress: 0,
                    buffer: 0,
                });

                startProgressBuffer();

                try {
                    const loggedUser = await getLoggedUser();

                    if (!loggedUser?.uid) {
                        patchState(store, {
                            loading: false,
                            error: 'User is not logged in.',
                        });

                        return;
                    }

                    const profile = await repository.getUserProfile(loggedUser.uid);

                    if (!profile) {
                        patchState(store, {
                            loading: false,
                            error: 'User profile was not found.',
                        });

                        return;
                    }

                    const userProfile = prepareUserProfile(profile, loggedUser.uid);

                    profileStore.setProfile(userProfile);

                    const userPosition = await locationService.getLocation();
                    const currentCity = await getCurrentCity(userPosition);

                    const userCoords = {
                        lat: userPosition.coords.latitude,
                        lon: userPosition.coords.longitude,
                    };

                    userProfile.currentLocCoords = userCoords;

                    const claims: UserClaims = {
                        gender: userProfile.gender!,
                        lookingForGender: userProfile.lookingForGender as any,
                        lookingForDistance: userProfile.lookingForDistance as number,
                        lookingForAge: userProfile.lookingForAge,
                        currentLocCoords: userCoords,
                        currentPlace: currentCity || userProfile.currentPlace || '',
                    };

                    if (!loggedUser.claims) {
                        await authStore.setCustomClaims(loggedUser.uid, claims);
                    }

                    if (currentCity && currentCity !== userProfile.currentPlace) {
                        const nextClaims = {
                            ...(loggedUser.claims ?? {}),
                            currentPlace: currentCity,
                            currentLocCoords: userCoords,
                        };

                        await authStore.setCustomClaims(loggedUser.uid, nextClaims);
                    }

                    patchState(store, {
                        progress: 25,
                    });

                    await syncMutualMatches(userProfile);

                    const matches = await repository.getMatchProfiles(
                        userProfile.matchParts?.matches ?? []
                    );

                    const users = await getUsers();

                    const hasPossibleMatches =
                        !!userProfile.matchParts?.possMatches?.length;

                    let possibleMatchIds = userProfile.matchParts?.possMatches ?? [];

                    if (!hasPossibleMatches || currentCity !== userProfile.currentPlace) {
                        possibleMatchIds = await buildPossibleMatches(
                            users,
                            loggedUser,
                            userProfile,
                            currentCity,
                            userPosition
                        );
                    } else {
                        patchState(store, {
                            progress: 70,
                        });
                    }

                    profileStore.setProfile(userProfile);

                    patchState(store, {
                        loggedUser: authStore.user(),
                        userProfile,
                        possibleMatchIds: shuffleArray(possibleMatchIds),
                        matches,
                        progress: 100,
                        loading: false,
                        error: null,
                    });
                } catch (error) {
                    console.error(error);

                    patchState(store, {
                        loading: false,
                        error: 'Failed to load discover data.',
                        progress: 100,
                    });
                }
            },

            clearDiscoverData() {
                patchState(store, initialState);
            },
        };
    })
);

function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const randomIndex = Math.floor(Math.random() * (i + 1));

        [shuffled[i], shuffled[randomIndex]] = [
            shuffled[randomIndex],
            shuffled[i],
        ];
    }

    return shuffled;
}
