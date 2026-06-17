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
import { PublicProfile } from '../../../shared/models/public-profile.model';
import { MatchParts, UserClass } from '../../../shared/models/user.model';
import { DiscoverRepository } from '../data-access/discover.repository';
import { AuthUser } from '../../auth/store/auth.slice';
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
    candidateSummaries: Record<
        string,
        {
            distanceKm?: number | null;
            sharedInterestCount?: number;
        }
    >;
    matches: PublicProfile[];
    progress: number;
    buffer: number;
    candidateCursor: string | null;
    candidateHasMore: boolean;
    loadingMoreCandidates: boolean;
    feedMode: DiscoveryFeedMode;
    premiumFilters: DiscoveryPremiumFilters;
    currentCity: string;
    currentLocCoords: { lat: number; lon: number } | null;
    locationFallbackActive: boolean;
    locationFallbackPlace: string;
    loading: boolean;
    error: string | null;
};

const initialState: DiscoverState = {
    loggedUser: null,
    userProfile: null,
    possibleMatchIds: [],
    candidateSummaries: {},
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
    locationFallbackActive: false,
    locationFallbackPlace: '',
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
                        locationFallback: store.locationFallbackActive(),
                        fallbackPlace:
                            store.locationFallbackPlace() ||
                            store.currentCity() ||
                            userProfile.currentPlace ||
                            '',
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

        async function buildPossibleMatches(
            candidates: DiscoverCandidatesResponse['candidates'],
            userProfile: UserClass,
            currentCity: string,
            resetPossibleMatches = true,
            syncLocation = true
        ) {
            const possibleMatchIds: string[] = [];
            const checkedCandidateIds: string[] = [];
            const candidateSummaries: DiscoverState['candidateSummaries'] = {};

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
                candidateSummaries[candidate.uid] = {
                    distanceKm: candidate.distanceKm ?? null,
                    sharedInterestCount: candidate.sharedInterestCount ?? 0,
                };

                checkedCandidateIds.push(candidate.uid);

                patchState(store, {
                    progress: Math.round(
                        (checkedCandidateIds.length / filteredCandidates.length) * 100
                    ),
                });
            }

            if (resetPossibleMatches && userProfile.uid && syncLocation) {
                userProfile.currentPlace = currentCity;

                await repository.updateUserProfile(userProfile.uid, {
                    currentPlace: currentCity,
                    currentLocCoords: userProfile.currentLocCoords,
                });
            }

            patchState(store, {
                candidateSummaries: resetPossibleMatches
                    ? candidateSummaries
                    : {
                        ...store.candidateSummaries(),
                        ...candidateSummaries,
                    },
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
            resetPossibleMatches: boolean,
            syncLocation = true
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
                    resetPossibleMatches && attempt === 0,
                    syncLocation
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
                    locationFallbackActive: false,
                    locationFallbackPlace: '',
                    candidateSummaries: {},
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

                    const matches = await repository.getMatchProfiles(
                        userProfile.matchParts?.matches ?? []
                    );

                    let possibleMatchIds: string[] = [];

                    patchState(store, {
                        loggedUser: authStore.user(),
                        userProfile,
                        possibleMatchIds,
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
                    > | null = null;
                    let currentCity = '';
                    let locationFallbackActive = false;
                    let shouldSyncLocation = true;

                    try {
                        userPosition = await locationService.getLocation();
                        currentCity = await getCurrentCity(userPosition);
                    } catch (locationError) {
                        console.warn(
                            'Skipping location-based discovery.',
                            locationError
                        );

                        locationFallbackActive = true;
                        shouldSyncLocation = false;
                        currentCity = userProfile.currentPlace?.trim() ?? '';
                    }

                    const userCoords = userPosition
                        ? {
                            lat: userPosition.coords.latitude,
                            lon: userPosition.coords.longitude,
                        }
                        : null;

                    if (userCoords) {
                        userProfile.currentLocCoords = userCoords;
                    }

                    patchState(store, {
                        currentCity,
                        currentLocCoords: userCoords,
                        locationFallbackActive,
                        locationFallbackPlace: locationFallbackActive ? currentCity : '',
                    });

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
                            true,
                            shouldSyncLocation
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
                        possibleMatchIds,
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

                if (!userProfile?.uid || !loggedUser?.uid) {
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

            addMatch(matchProfile: PublicProfile) {
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
