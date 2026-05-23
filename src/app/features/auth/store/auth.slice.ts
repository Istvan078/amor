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
    gender?: 'No' | 'Ferfi' | 'Egyeb' | string;
    lookingForGender?: 'No' | 'Ferfi' | string;
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