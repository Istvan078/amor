import { computed } from '@angular/core';
import {
    patchState,
    signalStore,
    withComputed,
    withMethods,
    withState,
} from '@ngrx/signals';

import { PublicProfile } from '../../../shared/models/public-profile.model';

type DiscoverViewMode = 'discover' | 'profile' | 'messages';

type DiscoverUiState = {
    mode: DiscoverViewMode;
    phoneView: boolean;
    selectedMessageProfile: PublicProfile | null;
};

const initialState: DiscoverUiState = {
    mode: 'discover',
    phoneView: false,
    selectedMessageProfile: null,
};

export const DiscoverUiStore = signalStore(
    {
        providedIn: 'root',
    },

    withState(initialState),

    withComputed((store) => ({
        isUserCardOpen: computed(() => store.mode() === 'profile'),
        isShowMessages: computed(() => store.mode() === 'messages'),
    })),

    withMethods((store) => ({
        showMatchesCard() {
            patchState(store, {
                mode: 'discover',
                selectedMessageProfile: null,
            });
        },

        openUserCard() {
            patchState(store, {
                mode: 'profile',
            });
        },

        showMessages(selectedMessageProfile?: PublicProfile | null) {
            patchState(store, {
                mode: 'messages',
                selectedMessageProfile: selectedMessageProfile ?? null,
            });
        },

        setPhoneView(phoneView: boolean) {
            patchState(store, {
                phoneView,
            });
        },

        reset() {
            patchState(store, initialState);
        },
    }))
);
