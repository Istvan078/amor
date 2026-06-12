import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
    Auth,
    User,
    authState,
    createUserWithEmailAndPassword,
    reload,
    sendEmailVerification,
    signInWithEmailAndPassword,
    signOut,
} from '@angular/fire/auth';
import { firstValueFrom, Observable, of } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AuthUser, UserClaims } from '../store/auth.slice';

type LoginData = {
    email: string;
    password: string;
};

@Injectable({
    providedIn: 'root',
})
export class AuthRepository {
    private injector = inject(Injector);
    private auth = inject(Auth);
    private http = inject(HttpClient);

    private usersApiUrl = environment.API_URL;

    readonly user$: Observable<User | null> = this.runInFirebaseContext(() =>
        authState(this.auth)
    );

    registerWithEmail(data: LoginData) {
        return this.runInFirebaseContext(() =>
            createUserWithEmailAndPassword(this.auth, data.email, data.password)
        );
    }

    signInWithEmail(data: LoginData) {
        return this.runInFirebaseContext(() =>
            signInWithEmailAndPassword(this.auth, data.email, data.password)
        );
    }

    signOut() {
        return this.runInFirebaseContext(() => signOut(this.auth));
    }

    async sendVerificationEmail() {
        const user = this.auth.currentUser;

        if (!user) {
            return;
        }

        await this.runInFirebaseContext(() => sendEmailVerification(user));
    }

    async refreshCurrentUser(): Promise<AuthUser | null> {
        const user = this.auth.currentUser;

        if (!user) {
            return null;
        }

        await this.runInFirebaseContext(() => reload(user));

        return this.createAuthUser(user);
    }

    async createAuthUser(user: User): Promise<AuthUser> {
        const idToken = await user.getIdToken();

        return {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            emailVerified: user.emailVerified,
            idToken,
            claims: null,
            raw: user,
        };
    }

    getClaims(uid: string | undefined, idToken: string | undefined) {
        if (!uid || !idToken) {
            return of(null);
        }

        return this.http.get<UserClaims>(
            this.usersApiUrl + `users/${uid}/claims`,
            {
                headers: this.createAuthHeaders(idToken),
            }
        );
    }

    getUsers(idToken: string | undefined) {
        if (!idToken) {
            return of([]);
        }

        return this.http.get<AuthUser[]>(this.usersApiUrl + 'users', {
            headers: this.createAuthHeaders(idToken),
        });
    }

    setCustomClaims(uid: string, idToken: string | undefined) {
        if (!idToken) {
            return of(null);
        }

        return this.http.post(
            this.usersApiUrl + 'setCustomClaims',
            {
                uid,
            },
            {
                headers: this.createAuthHeaders(idToken),
            }
        );
    }

    async deleteUser(uid?: string) {
        const user = this.auth.currentUser;
        const targetUid = uid ?? user?.uid;

        if (!user || !targetUid) {
            throw new Error('auth.errors.accountDeletionAuthRequired');
        }

        const idToken = await user.getIdToken(true);

        await firstValueFrom(
            this.http.post(
                this.usersApiUrl + 'deleteAccount',
                {
                    uid: targetUid,
                },
                {
                    headers: this.createAuthHeaders(idToken),
                }
            )
        );
        await this.runInFirebaseContext(() => signOut(this.auth));
    }

    private createAuthHeaders(idToken: string) {
        return new HttpHeaders().set('Authorization', idToken);
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
