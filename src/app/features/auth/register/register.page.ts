import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar,
    ModalController,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthService } from '../../../services/auth.service';
import { BaseService } from '../../../services/base.service';
import { ConfigService } from '../../../services/config.service';
import { UserClass } from '../../../shared/models/user.model';
import { IonModalPage } from '../../../modals/ion-modal/ion-modal.page';

@Component({
    selector: 'app-register',
    templateUrl: './register.page.html',
    styleUrls: ['./register.page.scss'],
    standalone: true,
    imports: [
        RouterLink,
        TranslocoDirective,
        IonHeader,
        IonToolbar,
        IonTitle,
        IonContent,
        IonButton,
        IonIcon,
    ],
})
export class RegisterPage implements OnInit {
    private auth = inject(AuthService);
    private base = inject(BaseService);
    private config = inject(ConfigService);
    private modalCtrl = inject(ModalController);
    private router = inject(Router);

    user: any;
    labels: any;

    ngOnInit(): void {
        this.labels = this.config.getLabels(true);

        this.auth.loggedUserSubject.subscribe((user) => {
            this.user = user;
        });
    }

    async createModal(componentProps: {}) {
        const ionModalRef = await this.modalCtrl.create({
            component: IonModalPage,
            animated: true,
            componentProps,
        });

        await ionModalRef.present();

        return ionModalRef;
    }

    async regUser() {
        let profileCreatedSuccessfully = false;

        if (!this.user) {
            const ionModal = await this.createModal({ regFirstPhase: true });
            const data = await ionModal.onWillDismiss();

            if (data.role === 'confirm') {
                await this.auth.registerEmail(data.data);

                const ionModal2 = await this.createModal({
                    regSecondPhase: true,
                    labels: this.labels,
                });

                const data2 = await ionModal2.onWillDismiss();

                if (data2.role === 'created-successfully') {
                    data2.data.uid = this.user?.uid ?? '';
                    await this.createUserProfile(data2);
                    profileCreatedSuccessfully = true;
                    this.base.userProfCreatedSubject.next(true);

                    if (!this.user?.uid) {
                        this.router.navigate(['/amor/login']);
                    } else {
                        this.router.navigate(['/amor/discover']);
                    }
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
                this.base.userProfCreatedSubject.next(true);
                this.router.navigate(['/amor/discover']);
            }
        }
    }

    async createUserProfile(data: any) {
        const userProfile: UserClass = data.data;

        Object.setPrototypeOf(userProfile, UserClass.prototype);

        userProfile.email = this.user?.email;
        userProfile.calcAge();

        Object.setPrototypeOf(userProfile, Object.prototype);

        await this.base.registerUserProf(this.user.uid, userProfile as {});
        this.base.userProfBehSubj.next(userProfile);
    }
}