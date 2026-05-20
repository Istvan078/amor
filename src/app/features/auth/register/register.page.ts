import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ModalController } from '@ionic/angular';
import {
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { Subscription } from 'rxjs';

import { IonModalPage } from '../../../modals/ion-modal/ion-modal.page';
import { AuthService } from '../../../services/auth.service';
import { BaseService } from '../../../services/base.service';
import { ConfigService } from '../../../services/config.service';
import { UserClass } from '../../../shared/models/user.model';

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
export class RegisterPage implements OnInit, OnDestroy {
    private auth = inject(AuthService);
    private base = inject(BaseService);
    private config = inject(ConfigService);
    private modalCtrl = inject(ModalController);
    private router = inject(Router);

    user: any;
    labels: any;

    private authSub = Subscription.EMPTY;

    ngOnInit(): void {
        this.labels = this.config.getLabels(true);

        this.authSub = this.auth.loggedUserSubject.subscribe((user) => {
            this.user = user;
        });
    }

    ngOnDestroy() {
        this.authSub.unsubscribe();
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
            const ionModal = await this.createModal({
                regFirstPhase: true,
            });

            const data = await ionModal.onWillDismiss();

            if (data.role === 'confirm') {
                const userCredentials = await this.auth.registerEmail(data.data);
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
                    this.base.userProfCreatedSubject.next(true);

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

                this.base.userProfCreatedSubject.next(true);
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

        await this.base.registerUserProf(this.user.uid, userProfile as {});
        this.base.userProfBehSubj.next(userProfile);
    }
}