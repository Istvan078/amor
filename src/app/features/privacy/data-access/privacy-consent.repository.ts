import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
    Firestore,
    doc,
    getDoc,
    setDoc,
} from '@angular/fire/firestore';

import { PrivacyConsent } from '../store/privacy-consent.slice';

@Injectable({
    providedIn: 'root',
})
export class PrivacyConsentRepository {
    private injector = inject(Injector);
    private firestore = inject(Firestore);

    async getConsent(uid: string): Promise<PrivacyConsent | undefined> {
        if (!uid) {
            return undefined;
        }

        const snapshot = await this.runInFirebaseContext(() => {
            const userRef = doc(this.firestore, `users/${uid}`);

            return getDoc(userRef);
        });

        if (!snapshot.exists()) {
            return undefined;
        }

        const data = snapshot.data();

        return data?.['privacyConsent'] as PrivacyConsent | undefined;
    }

    async saveConsent(uid: string, consent: PrivacyConsent): Promise<void> {
        await this.runInFirebaseContext(() => {
            const userRef = doc(this.firestore, `users/${uid}`);

            return setDoc(userRef, { privacyConsent: consent }, { merge: true });
        });
    }

    // Ensures AngularFire operations run inside Angular's injection context.
    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
