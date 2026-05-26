import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
    IonButton,
    IonCheckbox,
    IonContent,
    IonIcon,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthStore } from '../../auth/store/auth.store';
import { ProfileStore } from '../../profile/store/profile.store';
import { PrivacyConsentStore } from '../store/privacy-consent.store';
import { addIcons } from 'ionicons';
import { shieldCheckmarkOutline } from 'ionicons/icons';

type RequiredConsentKey =
    | 'termsAccepted'
    | 'privacyPolicyAccepted'
    | 'ageConfirmed';

type OptionalConsentKey =
    | 'analytics'
    | 'crashReports'
    | 'personalisation'
    | 'marketingNotifications';

@Component({
    selector: 'app-privacy-preferences',
    templateUrl: './privacy-preferences.page.html',
    styleUrls: ['./privacy-preferences.page.scss'],
    standalone: true,
    imports: [
        TranslocoDirective,
        IonButton,
        IonCheckbox,
        IonContent,
        IonIcon,
    ],
})
export class PrivacyPreferencesPage implements OnInit {
    readonly authStore = inject(AuthStore);
    private profileStore = inject(ProfileStore);
    readonly privacyStore = inject(PrivacyConsentStore);
    private router = inject(Router);

    termsAccepted = false;
    privacyPolicyAccepted = false;
    ageConfirmed = false;
    analytics = false;
    crashReports = false;
    personalisation = false;
    marketingNotifications = false;

    constructor() {
        addIcons({
            shieldCheckmarkOutline: shieldCheckmarkOutline,
        });
    }

    async ngOnInit() {
        const uid = this.authStore.uid();

        if (!uid) {
            return;
        }

        await this.privacyStore.loadConsent(uid);

        this.termsAccepted = this.privacyStore.termsAccepted();
        this.privacyPolicyAccepted = this.privacyStore.privacyPolicyAccepted();
        this.ageConfirmed = this.privacyStore.ageConfirmed();
        this.analytics = this.privacyStore.analytics();
        this.crashReports = this.privacyStore.crashReports();
        this.personalisation = this.privacyStore.personalisation();
        this.marketingNotifications = this.privacyStore.marketingNotifications();
    }

    toggleRequired(key: RequiredConsentKey) {
        this[key] = !this[key];
    }

    toggleOptional(key: OptionalConsentKey) {
        this[key] = !this[key];
    }

    canContinue() {
        return (
            this.termsAccepted &&
            this.privacyPolicyAccepted &&
            this.ageConfirmed &&
            !this.privacyStore.loading()
        );
    }

    async acceptAndContinue() {
        const uid = this.authStore.uid();

        if (!uid || !this.canContinue()) {
            return;
        }

        await this.privacyStore.acceptConsent(uid, {
            analytics: this.analytics,
            crashReports: this.crashReports,
            personalisation: this.personalisation,
            marketingNotifications: this.marketingNotifications,
        });

        await this.router.navigate(['/amor/discover']);
    }

    async decideLater() {
        const autoFillEmail = this.authStore.email();

        await this.authStore.signOut();
        this.authStore.setAutoFillEmail(autoFillEmail);
        this.profileStore.clearProfile();
        this.privacyStore.clearConsent();

        await this.router.navigate(['/amor/login']);
    }
}
