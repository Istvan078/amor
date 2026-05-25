import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
    Firestore,
    deleteDoc,
    doc,
    getDoc,
    setDoc,
    updateDoc,
} from '@angular/fire/firestore';

import { UserClass } from '../../../shared/models/user.model';

@Injectable({
    providedIn: 'root',
})
export class ProfileRepository {
    private injector = inject(Injector);
    private firestore = inject(Firestore);

    async getProfile(uid: string): Promise<UserClass | undefined> {
        const snapshot = await this.runInFirebaseContext(() => {
            const profileRef = doc(this.firestore, `users/${uid}`);

            return getDoc(profileRef);
        });

        if (!snapshot.exists()) {
            return undefined;
        }

        return {
            uid: snapshot.id,
            ...snapshot.data(),
        } as UserClass;
    }

    async createProfile(uid: string, profile: Partial<UserClass>) {
        await this.runInFirebaseContext(() => {
            const profileRef = doc(this.firestore, `users/${uid}`);

            return setDoc(profileRef, profile);
        });
    }

    async updateProfile(uid: string, profile: Partial<UserClass>) {
        await this.runInFirebaseContext(() => {
            const profileRef = doc(this.firestore, `users/${uid}`);

            return updateDoc(profileRef, profile);
        });
    }

    async deleteProfile(uid: string): Promise<void> {
        await this.runInFirebaseContext(() => {
            const profileRef = doc(this.firestore, `users/${uid}`)
            return deleteDoc(profileRef)
        })
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
