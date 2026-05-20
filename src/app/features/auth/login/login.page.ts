import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
    IonButton,
    IonContent,
    IonHeader,
    IonInput,
    IonLabel,
    IonTitle,
    IonToolbar,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthService } from '../../../services/auth.service';
import { BaseService } from '../../../services/base.service';

@Component({
    selector: 'app-login',
    templateUrl: './login.page.html',
    styleUrls: ['./login.page.scss'],
    standalone: true,
    imports: [
        FormsModule,
        RouterLink,
        TranslocoDirective,
        IonHeader,
        IonToolbar,
        IonTitle,
        IonContent,
        IonLabel,
        IonInput,
        IonButton,
    ],
})
export class LoginPage implements OnInit {
    private auth = inject(AuthService);
    private router = inject(Router);
    private base = inject(BaseService);

    loginData = {
        data: {
            email: '',
            password: '',
        },
    };

    ngOnInit(): void {
        this.auth.authAutoFillSubj.subscribe((email) => {
            if (email) {
                this.loginData.data.email = email;
            }
        });
    }

    async loginUser() {
        this.base.userProfCreatedSubject.next(false);
        await this.auth.signInWithEmail(this.loginData.data);
        this.router.navigate(['/amor/discover']);
    }
}