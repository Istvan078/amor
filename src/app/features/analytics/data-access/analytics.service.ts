import { Injectable, inject } from '@angular/core';

import { environment } from '../../../../environments/environment';
import { PrivacyConsentStore } from '../../privacy/store/privacy-consent.store';
import {
    AnalyticsEventName,
    AnalyticsEventProperties,
    AnalyticsRepository,
} from './analytics.repository';

@Injectable({
    providedIn: 'root',
})
export class AnalyticsService {
    private privacyStore = inject(PrivacyConsentStore);
    private repository = inject(AnalyticsRepository);

    async track(
        uid: string | null | undefined,
        eventName: AnalyticsEventName,
        properties: AnalyticsEventProperties = {}
    ) {
        if (!uid || !this.privacyStore.hasRequiredConsent() || !this.privacyStore.analytics()) {
            return false;
        }

        try {
            await this.repository.trackEvent(uid, eventName, properties);
            return true;
        } catch (error) {
            if (!environment.production) {
                console.warn('Analytics event was not saved.', error);
            }

            return false;
        }
    }
}
