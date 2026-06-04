import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
    arrowBackOutline,
    chatbubbleEllipsesOutline,
    checkmarkDoneOutline,
    heartOutline,
    megaphoneOutline,
    notificationsOutline,
    sparklesOutline,
    starOutline,
    trashOutline,
} from 'ionicons/icons';

import {
    AppNotification,
    AppNotificationType,
} from './data-access/notifications.repository';
import { NotificationNavigationService } from './data-access/notification-navigation.service';
import { NotificationsStore } from './store/notifications.store';

@Component({
    selector: 'app-notification-center',
    templateUrl: './notification-center.page.html',
    styleUrls: ['./notification-center.page.scss'],
    standalone: true,
    imports: [IonContent, IonIcon, RouterLink, TranslocoDirective],
})
export class NotificationCenterPage {
    readonly notificationsStore = inject(NotificationsStore);

    private notificationNavigation = inject(NotificationNavigationService);
    private transloco = inject(TranslocoService);

    constructor() {
        addIcons({
            arrowBackOutline,
            chatbubbleEllipsesOutline,
            checkmarkDoneOutline,
            heartOutline,
            megaphoneOutline,
            notificationsOutline,
            sparklesOutline,
            starOutline,
            trashOutline,
        });
    }

    trackByNotificationId(_: number, notification: AppNotification) {
        return notification.id;
    }

    getNotificationIcon(type: AppNotificationType) {
        switch (type) {
            case 'new_match':
                return 'heart-outline';
            case 'new_message':
                return 'chatbubble-ellipses-outline';
            case 'super_like':
                return 'star-outline';
            case 'promotion':
                return 'megaphone-outline';
            default:
                return 'sparkles-outline';
        }
    }

    formatNotificationDate(notification: AppNotification) {
        if (!notification.createdAt) {
            return '';
        }

        return new Intl.DateTimeFormat(this.transloco.getActiveLang(), {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(notification.createdAt);
    }

    async openNotification(notification: AppNotification) {
        if (!notification.isRead) {
            await this.notificationsStore.markAsRead(notification.id);
        }

        await this.notificationNavigation.openNotificationTarget(notification);
    }

    async markAllAsRead() {
        await this.notificationsStore.markAllAsRead();
    }

    async deleteNotification(event: Event, notification: AppNotification) {
        event.stopPropagation();
        await this.notificationsStore.deleteNotification(notification.id);
    }

    async deleteReadNotifications() {
        await this.notificationsStore.deleteReadNotifications();
    }
}
