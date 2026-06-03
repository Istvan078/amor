import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
    arrowBackOutline,
    chatbubbleEllipsesOutline,
    checkmarkDoneOutline,
    heartOutline,
    notificationsOutline,
    sparklesOutline,
} from 'ionicons/icons';

import {
    AppNotification,
    AppNotificationType,
} from './data-access/notifications.repository';
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

    private router = inject(Router);
    private transloco = inject(TranslocoService);

    constructor() {
        addIcons({
            arrowBackOutline,
            chatbubbleEllipsesOutline,
            checkmarkDoneOutline,
            heartOutline,
            notificationsOutline,
            sparklesOutline,
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

        await this.router.navigate(['/amor/discover']);
    }

    async markAllAsRead() {
        await this.notificationsStore.markAllAsRead();
    }
}
