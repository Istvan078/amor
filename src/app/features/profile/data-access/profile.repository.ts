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

type FirestoreData = Record<string, any>;

function sanitizeFirestoreValue(value: unknown): unknown {
    if (value === undefined || typeof value === 'function') {
        return undefined;
    }

    if (value === null || typeof value !== 'object') {
        return value;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value
            .map((item) => sanitizeFirestoreValue(item))
            .filter((item) => item !== undefined);
    }

    return Object.entries(value as Record<string, unknown>).reduce<FirestoreData>(
        (result, [key, item]) => {
            const sanitizedValue = sanitizeFirestoreValue(item);

            if (sanitizedValue !== undefined) {
                result[key] = sanitizedValue;
            }

            return result;
        },
        {}
    );
}

function sanitizeProfileForFirestore(profile: Partial<UserClass>): FirestoreData {
    return sanitizeFirestoreValue(profile) as FirestoreData;
}

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

            return setDoc(profileRef, sanitizeProfileForFirestore(profile));
        });
    }

    async updateProfile(uid: string, profile: Partial<UserClass>) {
        await this.runInFirebaseContext(() => {
            const profileRef = doc(this.firestore, `users/${uid}`);

            return updateDoc(profileRef, sanitizeProfileForFirestore(profile));
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
