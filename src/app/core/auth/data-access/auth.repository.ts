import { inject, Injectable } from '@angular/core';
import {
    Auth,
    authState,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    User,
} from '@angular/fire/auth';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthRepository {
    private auth = inject(Auth);

    readonly user$: Observable<User | null> = authState(this.auth);

    registerWithEmail(email: string, password: string) {
        return createUserWithEmailAndPassword(this.auth, email, password);
    }

    signInWithEmail(email: string, password: string) {
        return signInWithEmailAndPassword(this.auth, email, password);
    }

    signOut() {
        return signOut(this.auth);
    }

    async getIdToken() {
        return this.auth.currentUser?.getIdToken();
    }

    getCurrentUser() {
        return this.auth.currentUser;
    }
}