import { Injectable, inject } from '@angular/core';
import {
    Firestore,
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
    private firestore = inject(Firestore);

    async getProfile(uid: string): Promise<UserClass | undefined> {
        const profileRef = doc(this.firestore, `users/${uid}`);
        const snapshot = await getDoc(profileRef);

        if (!snapshot.exists()) {
            return undefined;
        }

        return {
            uid: snapshot.id,
            ...snapshot.data(),
        } as UserClass;
    }

    async createProfile(uid: string, profile: Partial<UserClass>) {
        const profileRef = doc(this.firestore, `users/${uid}`);
        await setDoc(profileRef, profile);
    }

    async updateProfile(uid: string, profile: Partial<UserClass>) {
        const profileRef = doc(this.firestore, `users/${uid}`);
        await updateDoc(profileRef, profile);
    }
}