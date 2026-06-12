import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
    Firestore,
    addDoc,
    collection,
    serverTimestamp,
} from '@angular/fire/firestore';

export type AnalyticsEventName =
    | 'boost_started'
    | 'match_created'
    | 'match_liked'
    | 'match_passed'
    | 'match_rewind_used'
    | 'match_super_liked'
    | 'message_sent'
    | 'message_retry_sent'
    | 'message_edited'
    | 'message_deleted'
    | 'paywall_opened'
    | 'profile_completed'
    | 'profile_updated'
    | 'purchase_cancelled'
    | 'purchase_completed'
    | 'purchase_failed'
    | 'purchase_started'
    | 'restore_purchases_completed'
    | 'restore_purchases_failed'
    | 'restore_purchases_started';

export type AnalyticsEventProperties = Record<string, unknown>;

@Injectable({
    providedIn: 'root',
})
export class AnalyticsRepository {
    private injector = inject(Injector);
    private firestore = inject(Firestore);

    async trackEvent(
        uid: string,
        eventName: AnalyticsEventName,
        properties: AnalyticsEventProperties = {}
    ) {
        await this.runInFirebaseContext(() => {
            const analyticsCollection = collection(
                this.firestore,
                `users/${uid}/analytics`
            );

            return addDoc(analyticsCollection, {
                eventName,
                properties: this.sanitizeProperties(properties),
                clientCreatedAt: new Date().toISOString(),
                createdAt: serverTimestamp(),
            });
        });
    }

    private sanitizeProperties(properties: AnalyticsEventProperties) {
        return this.sanitizeValue(properties) as AnalyticsEventProperties;
    }

    private sanitizeValue(value: unknown): unknown {
        if (value === undefined || typeof value === 'function') {
            return undefined;
        }

        if (value === null || typeof value !== 'object') {
            return value;
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        if (Array.isArray(value)) {
            return value
                .map((item) => this.sanitizeValue(item))
                .filter((item) => item !== undefined);
        }

        return Object.entries(value as Record<string, unknown>).reduce<
            AnalyticsEventProperties
        >((result, [key, item]) => {
            const sanitizedValue = this.sanitizeValue(item);

            if (sanitizedValue !== undefined) {
                result[key] = sanitizedValue;
            }

            return result;
        }, {});
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
