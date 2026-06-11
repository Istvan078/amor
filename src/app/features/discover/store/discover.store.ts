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
import {
    DiscoverCandidatesResponse,
    DiscoveryFeedMode,
    DiscoveryPremiumFilters,
    MatchIndexRepository,
} from '../../matching/data-access/match-index.repository';
import { isProfileCompleteForDiscovery } from '../../profile/utils/profile-completeness';

type DiscoverState = {
    loggedUser: any | null;
    userProfile: UserClass | null;
    possibleMatchIds: string[];
    matches: UserClass[];
    progress: number;
    buffer: number;
    candidateCursor: string | null;
    candidateHasMore: boolean;
    loadingMoreCandidates: boolean;
    feedMode: DiscoveryFeedMode;
    premiumFilters: DiscoveryPremiumFilters;
    currentCity: string;
    currentLocCoords: { lat: number; lon: number } | null;
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
    candidateCursor: null,
    candidateHasMore: false,
    loadingMoreCandidates: false,
    feedMode: 'recommended',
    premiumFilters: {},
    currentCity: '',
    currentLocCoords: null,
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
        const matchIndexRepository = inject(MatchIndexRepository);

        async function getLoggedUser(): Promise<AuthUser | null> {
            await authStore.waitForAuthReady();

            if (authStore.user()) {
                return authStore.user();
            }

            return null;
        }

        async function getCandidatePage(
            userProfile: UserClass,
            startAfter?: string | null
        ): Promise<DiscoverCandidatesResponse> {
            try {
                return matchIndexRepository.loadCandidatePage(
                    userProfile,
                    20,
                    startAfter ?? undefined,
                    {
                        feedMode: store.feedMode(),
                        premiumFilters: store.premiumFilters(),
                    }
                );
            } catch (error) {
                console.warn('Match index lookup failed.', error);
                return {
                    candidates: [],
                    nextCursor: null,
                };
            }
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
                const alreadyMatched =
                    userProfile.matchParts.matches?.includes(likedUid);

                if (!alreadyMatched) {
                    try {
                        const matchResult =
                            await repository.createMutualMatch(likedUid);

                        if (matchResult.matchParts) {
                            userProfile.matchParts = matchResult.matchParts;
                            profileStore.setProfile(userProfile);
                        }
                    } catch (error) {
                        console.warn('Mutual match sync failed.', error);
                    }
                }
            }
        }

        async function buildPossibleMatches(
            candidates: DiscoverCandidatesResponse['candidates'],
            userProfile: UserClass,
            currentCity: string,
            resetPossibleMatches = true
        ) {
            const possibleMatchIds: string[] = [];
            const checkedCandidateIds: string[] = [];

            if (resetPossibleMatches) {
                userProfile.matchParts!.possMatches = [];
            }

            const filteredCandidates = candidates.filter((candidate) => {
                if (!candidate?.uid || candidate.uid === userProfile.uid) {
                    return false;
                }

                return (
                    !userProfile.matchParts?.liked?.includes(candidate.uid) &&
                    !userProfile.matchParts?.notLiked?.includes(candidate.uid) &&
                    !userProfile.matchParts?.matches?.includes(candidate.uid) &&
                    !userProfile.blockedUsers?.includes(candidate.uid) &&
                    !userProfile.reportedUsers?.includes(candidate.uid)
                );
            });

            if (!filteredCandidates.length) {
                patchState(store, {
                    progress: 100,
                });

                return possibleMatchIds;
            }

            for (const candidate of filteredCandidates) {
                possibleMatchIds.push(candidate.uid);

                if (!userProfile.matchParts!.possMatches.includes(candidate.uid)) {
                    userProfile.matchParts!.possMatches.push(candidate.uid);
                }

                checkedCandidateIds.push(candidate.uid);

                patchState(store, {
                    progress: Math.round(
                        (checkedCandidateIds.length / filteredCandidates.length) * 100
                    ),
                });
            }

            if (resetPossibleMatches && userProfile.uid) {
                userProfile.currentPlace = currentCity;

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

        function mergeUniqueIds(existingIds: string[], nextIds: string[]) {
            const mergedIds = [...existingIds];
            const seenIds = new Set(existingIds);

            nextIds.forEach((uid) => {
                if (!seenIds.has(uid)) {
                    mergedIds.push(uid);
                    seenIds.add(uid);
                }
            });

            return mergedIds;
        }

        async function loadCandidateIdsFromPages(
            userProfile: UserClass,
            currentCity: string,
            startAfter: string | null,
            resetPossibleMatches: boolean
        ) {
            let cursor = startAfter;
            let nextCursor: string | null = cursor;
            const loadedIds: string[] = [];

            for (let attempt = 0; attempt < 4; attempt++) {
                const candidatePage = await getCandidatePage(userProfile, cursor);

                nextCursor = candidatePage.nextCursor;

                const pageIds = await buildPossibleMatches(
                    candidatePage.candidates,
                    userProfile,
                    currentCity,
                    resetPossibleMatches && attempt === 0
                );

                loadedIds.push(...pageIds);

                if (loadedIds.length || !nextCursor) {
                    break;
                }

                cursor = nextCursor;
            }

            return {
                ids: loadedIds,
                nextCursor,
            };
        }

        return {
            async loadDiscoverData() {
                patchState(store, {
                    loading: true,
                    error: null,
                    progress: 0,
                    buffer: 0,
                    candidateCursor: null,
                    candidateHasMore: false,
                    loadingMoreCandidates: false,
                    currentCity: '',
                    currentLocCoords: null,
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
                    const previousPlace = userProfile.currentPlace;

                    profileStore.setProfile(userProfile);

                    await syncMutualMatches(userProfile);

                    const matches = await repository.getMatchProfiles(
                        userProfile.matchParts?.matches ?? []
                    );

                    let possibleMatchIds = userProfile.matchParts?.possMatches ?? [];

                    patchState(store, {
                        loggedUser: authStore.user(),
                        userProfile,
                        possibleMatchIds: shuffleArray(possibleMatchIds),
                        matches,
                        progress: 35,
                        error: null,
                    });

                    if (!isProfileCompleteForDiscovery(userProfile)) {
                        patchState(store, {
                            loggedUser: authStore.user(),
                            userProfile,
                            possibleMatchIds: [],
                            matches,
                            progress: 100,
                            loading: false,
                            error: null,
                        });

                        return;
                    }

                    let userPosition: Awaited<
                        ReturnType<LocationService['getLocation']>
                    >;
                    let currentCity = '';

                    try {
                        userPosition = await locationService.getLocation();
                        currentCity = await getCurrentCity(userPosition);
                    } catch (locationError) {
                        console.warn(
                            'Skipping location-based discovery.',
                            locationError
                        );

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

                        return;
                    }

                    const userCoords = {
                        lat: userPosition.coords.latitude,
                        lon: userPosition.coords.longitude,
                    };

                    userProfile.currentLocCoords = userCoords;

                    patchState(store, {
                        currentCity,
                        currentLocCoords: userCoords,
                    });

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
                        progress: 55,
                    });

                    const hasPossibleMatches = !!possibleMatchIds.length;
                    const shouldRebuildPossibleMatches =
                        !hasPossibleMatches ||
                        (!!currentCity && currentCity !== previousPlace);

                    if (shouldRebuildPossibleMatches) {
                        const candidateResult = await loadCandidateIdsFromPages(
                            userProfile,
                            currentCity,
                            null,
                            true
                        );

                        possibleMatchIds = candidateResult.ids;

                        patchState(store, {
                            candidateCursor: candidateResult.nextCursor,
                            candidateHasMore: !!candidateResult.nextCursor,
                        });
                    } else {
                        patchState(store, {
                            candidateCursor: null,
                            candidateHasMore: true,
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

            setFeedMode(feedMode: DiscoveryFeedMode) {
                patchState(store, {
                    feedMode,
                });
            },

            setPremiumFilters(premiumFilters: DiscoveryPremiumFilters) {
                patchState(store, {
                    premiumFilters,
                });
            },

            async loadMoreCandidates() {
                if (store.loadingMoreCandidates() || !store.candidateHasMore()) {
                    return false;
                }

                const userProfile = store.userProfile();
                const loggedUser = store.loggedUser() as AuthUser | null;
                const currentLocCoords = store.currentLocCoords();

                if (!userProfile?.uid || !loggedUser?.uid || !currentLocCoords) {
                    patchState(store, {
                        candidateHasMore: false,
                    });
                    return false;
                }

                patchState(store, {
                    loadingMoreCandidates: true,
                    error: null,
                });

                try {
                    const candidateResult = await loadCandidateIdsFromPages(
                        userProfile,
                        store.currentCity(),
                        store.candidateCursor(),
                        false
                    );
                    const existingIds = store.possibleMatchIds();
                    const nextIds = candidateResult.ids.filter(
                        (uid) => !existingIds.includes(uid)
                    );
                    const possibleMatchIds = mergeUniqueIds(existingIds, nextIds);

                    profileStore.setProfile(userProfile);

                    patchState(store, {
                        userProfile,
                        possibleMatchIds,
                        candidateCursor: candidateResult.nextCursor,
                        candidateHasMore: !!candidateResult.nextCursor,
                        loadingMoreCandidates: false,
                        progress: 100,
                    });

                    return nextIds.length > 0;
                } catch (error) {
                    console.error(error);

                    patchState(store, {
                        loadingMoreCandidates: false,
                        error: 'Failed to load more discover profiles.',
                    });

                    return false;
                }
            },

            clearDiscoverData() {
                patchState(store, initialState);
            },

            removeMatch(matchUid: string) {
                patchState(store, {
                    matches: store.matches().filter((match) => match.uid !== matchUid),
                });
            },

            addMatch(matchProfile: UserClass) {
                if (!matchProfile.uid) {
                    return;
                }

                patchState(store, {
                    matches: [
                        ...store
                            .matches()
                            .filter((match) => match.uid !== matchProfile.uid),
                        matchProfile,
                    ],
                });
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
