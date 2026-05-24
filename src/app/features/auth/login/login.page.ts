import { Component, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
    IonButton,
    IonContent,
    IonIcon,
    IonInput,
    IonLabel,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import { ProfileStore } from '../../profile/store/profile.store';
import { AuthStore } from '../store/auth.store';

@Component({
    selector: 'app-login',
    templateUrl: './login.page.html',
    styleUrls: ['./login.page.scss'],
    standalone: true,
    imports: [
        FormsModule,
        RouterLink,
        TranslocoDirective,
        IonContent,
        IonIcon,
        IonLabel,
        IonInput,
        IonButton,
    ],
})
export class LoginPage {
    private authStore = inject(AuthStore);
    private router = inject(Router);
    private profileStore = inject(ProfileStore);

    loginData = {
        data: {
            email: '',
            password: '',
        },
    };

    constructor() {
        effect(() => {
            const email = this.authStore.autoFillEmail();

            if (email) {
                this.loginData.data.email = email;
            }
        });
    }

    async loginUser() {
        this.profileStore.setProfileCreated(false);
        await this.authStore.signInWithEmail(this.loginData.data);
        await this.profileStore.loadProfile(this.authStore.uid() ?? '');
        this.router.navigate(['/amor/discover']);
    }
}
