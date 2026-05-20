import { computed } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';

export type AuthUser = {
  uid: string;
  email: string | null;
  idToken?: string;
  claims?: UserClaims | null;
};

export type UserClaims = {
  gender?: string;
  lookingForGender?: string;
  lookingForDistance?: number;
  currentPlace?: string;
  currentLocCoords?: {
    lat: number;
    lon: number;
  };
  lookingForAge?: {
    lower: number;
    upper: number;
  };
};

type AuthState = {
  user: AuthUser | null;
  claims: UserClaims | null;
  loading: boolean;
  error: string | null;
};

const initialState: AuthState = {
  user: null,
  claims: null,
  loading: false,
  error: null,
};

export const AuthStore = signalStore(
  { providedIn: 'root' },

  withState(initialState),

  withComputed((store) => ({
    isLoggedIn: computed(() => !!store.user()),
    hasClaims: computed(() => !!store.claims()),
    uid: computed(() => store.user()?.uid ?? null),
  })),

  withMethods((store) => ({
    setUser(user: AuthUser | null) {
      patchState(store, { user });
    },

    setClaims(claims: UserClaims | null) {
      patchState(store, { claims });
    },

    setLoading(loading: boolean) {
      patchState(store, { loading });
    },

    setError(error: string | null) {
      patchState(store, { error });
    },

    clear() {
      patchState(store, initialState);
    },
  }))
);