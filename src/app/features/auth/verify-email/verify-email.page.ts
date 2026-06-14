import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
    IonButton,
    IonContent,
    IonIcon,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthStore } from '../store/auth.store';

@Component({
    selector: 'app-verify-email',
    templateUrl: './verify-email.page.html',
    styleUrls: ['./verify-email.page.scss'],
    standalone: true,
    imports: [
        TranslocoDirective,
        IonButton,
        IonContent,
        IonIcon,
    ],
})
export class VerifyEmailPage {
    readonly authStore = inject(AuthStore);
    private router = inject(Router);

    resendSent = false;
    checking = false;

    async resendVerificationEmail() {
        this.resendSent = await this.authStore.sendVerificationEmail();
    }

    async refreshVerificationState() {
        if (this.checking || this.authStore.loading()) {
            return;
        }

        this.checking = true;

        try {
            const user = await this.authStore.refreshCurrentUser();

            if (user?.emailVerified || this.authStore.canModerate()) {
                await this.router.navigate(['/amor/discover']);
            }
        } finally {
            this.checking = false;
        }
    }

    async backToLogin() {
        await this.authStore.signOut();
        await this.router.navigate(['/amor/login']);
    }
}
