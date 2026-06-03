import { AppNotification } from '../data-access/notifications.repository';

export type PushNotificationsState = {
    loading: boolean;
    registered: boolean;
    error: string | null;
    notifications: AppNotification[];
    unreadCount: number;
};

export const initialState: PushNotificationsState = {
    loading: false,
    registered: false,
    error: null,
    notifications: [],
    unreadCount: 0,
};
