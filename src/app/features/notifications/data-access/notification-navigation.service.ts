import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

import type {
    AppNotification,
    AppNotificationType,
} from './notifications.repository';
import { AuthStore } from '../../auth/store/auth.store';

type NotificationTarget = Pick<
    AppNotification,
    'type' | 'actorUid' | 'conversationId'
>;

@Injectable({
    providedIn: 'root',
})
export class NotificationNavigationService {
    private router = inject(Router);
    private authStore = inject(AuthStore);

    async openNotificationTarget(notification: NotificationTarget) {
        const actorUid =
            this.toNonEmptyString(notification.actorUid) ??
            this.getOtherConversationParticipant(notification.conversationId);

        if (
            actorUid &&
            (notification.type === 'new_message' || notification.type === 'new_match')
        ) {
            await this.router.navigate(['/amor/discover'], {
                queryParams: {
                    view: 'messages',
                    matchUid: actorUid,
                    ...(notification.conversationId
                        ? { conversationId: notification.conversationId }
                        : {}),
                },
            });
            return;
        }

        if (actorUid && notification.type === 'super_like') {
            await this.router.navigate(['/amor/discover'], {
                queryParams: {
                    targetUid: actorUid,
                    notificationType: notification.type,
                },
            });
            return;
        }

        await this.router.navigate(['/amor/notifications']);
    }

    async openPushData(data?: Record<string, unknown>) {
        const type = this.toNotificationType(data?.['type']);
        const actorUid = this.toNonEmptyString(data?.['actorUid']);
        const conversationId = this.toNonEmptyString(data?.['conversationId']);

        await this.openNotificationTarget({
            type,
            actorUid,
            conversationId,
        });
    }

    private toNotificationType(value: unknown): AppNotificationType {
        if (
            value === 'new_message' ||
            value === 'new_match' ||
            value === 'super_like' ||
            value === 'promotion' ||
            value === 'profile_boost_ended' ||
            value === 'premium_expiry' ||
            value === 'report_status'
        ) {
            return value;
        }

        return 'promotion';
    }

    private toNonEmptyString(value: unknown) {
        return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    }

    private getOtherConversationParticipant(conversationId?: string) {
        const uid = this.authStore.user()?.uid;

        if (!uid || !conversationId) {
            return undefined;
        }

        return conversationId
            .split('_')
            .find((participantUid) => participantUid && participantUid !== uid);
    }
}
