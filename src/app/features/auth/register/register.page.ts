import { Component, OnInit, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
    IonButton,
    IonContent,
    IonIcon,
    ModalController,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import { IonModalPage } from '../../../modals/ion-modal/ion-modal.page';
import { ConfigService } from '../../../services/config.service';
import { UserClass } from '../../../shared/models/user.model';
import { ProfileStore } from '../../profile/store/profile.store';
import { AuthStore } from '../store/auth.store';

@Component({
    selector: 'app-register',
    templateUrl: './register.page.html',
    styleUrls: ['./register.page.scss'],
    standalone: true,
    imports: [
        RouterLink,
        TranslocoDirective,
        IonContent,
        IonButton,
        IonIcon,
    ],
})
export class RegisterPage implements OnInit {
    private authStore = inject(AuthStore);
    private profileStore = inject(ProfileStore);
    private config = inject(ConfigService);
    private modalCtrl = inject(ModalController);
    private router = inject(Router);

    user: any;
    labels: any;

    constructor() {
        effect(() => {
            this.user = this.authStore.user();
        });
    }

    ngOnInit(): void {
        this.labels = this.config.getLabels(true);
    }

    async createModal(componentProps: {}) {
        const ionModalRef = await this.modalCtrl.create({
            component: IonModalPage,
            animated: true,
            cssClass: 'amor-auth-modal',
            componentProps,
        });

        await ionModalRef.present();

        return ionModalRef;
    }

    async regUser() {
        let profileCreatedSuccessfully = false;

        if (!this.user) {
            const ionModal = await this.createModal({
                regFirstPhase: true,
            });

            const data = await ionModal.onWillDismiss();

            if (data.role === 'confirm') {
                const userCredentials = await this.authStore.registerEmail(data.data);
                this.user = userCredentials.user;

                const ionModal2 = await this.createModal({
                    regSecondPhase: true,
                    labels: this.labels,
                });

                const data2 = await ionModal2.onWillDismiss();

                if (data2.role === 'created-successfully') {
                    data2.data.uid = this.user.uid;

                    await this.createUserProfile(data2);

                    profileCreatedSuccessfully = true;
                    this.profileStore.setProfileCreated(true);

                    this.router.navigate(['/amor/discover']);
                }
            }
        }

        if (this.user?.uid && !profileCreatedSuccessfully) {
            const ionModal = await this.createModal({
                regSecondPhase: true,
                labels: this.labels,
            });

            const data = await ionModal.onWillDismiss();

            if (data.role === 'created-successfully') {
                data.data.uid = this.user.uid;

                await this.createUserProfile(data);

                this.profileStore.setProfileCreated(true);
                this.router.navigate(['/amor/discover']);
            }
        }
    }

    async createUserProfile(data: any) {
        const userProfile: UserClass = data.data;

        Object.setPrototypeOf(userProfile, UserClass.prototype);

        userProfile.uid = this.user.uid;
        userProfile.email = this.user.email;
        userProfile.calcAge();

        Object.setPrototypeOf(userProfile, Object.prototype);

        await this.profileStore.createProfile(this.user.uid, userProfile);
        this.profileStore.setProfile(userProfile);
    }
}
