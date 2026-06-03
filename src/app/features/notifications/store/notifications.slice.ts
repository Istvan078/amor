type PushNotificationsState = {
    loading: boolean;
    registered: boolean;
    error: string | null;
};

export const initialState: PushNotificationsState = {
    loading: false,
    registered: false,
    error: null,
};