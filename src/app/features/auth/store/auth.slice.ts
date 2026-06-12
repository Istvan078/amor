export type AuthUser = {
    uid: string;
    email: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    emailVerified?: boolean;
    idToken?: string;
    claims?: UserClaims | null;
    raw?: unknown;
};

export type UserClaims = {
    admin?: boolean;
    moderator?: boolean;
    premiumAccess?: boolean;
};

type AuthState = {
    readonly user: AuthUser | null;
    readonly claims: UserClaims | null;
    readonly users: AuthUser[];
    readonly autoFillEmail: string | null;
    readonly initialized: boolean;
    readonly loading: boolean;
    readonly error: string | null;
};

export const initialState: AuthState = {
    user: null,
    claims: null,
    users: [],
    autoFillEmail: null,
    initialized: false,
    loading: false,
    error: null,
};
