import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    doc,
    getDoc,
    updateDoc,
} from '@angular/fire/firestore';

import { UserClass } from '../../../shared/models/user.model';

@Injectable({
    providedIn: 'root',
})
export class DiscoverRepository {
    private firestore = inject(Firestore);

    async getUserProfile(uid: string): Promise<UserClass | undefined> {
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

    async getPossibleMatchProfile(uid: string): Promise<UserClass | undefined> {
        return this.getUserProfile(uid);
    }

    async getMatchProfiles(matchUids: string[]): Promise<UserClass[]> {
        const profiles: UserClass[] = [];

        for (const uid of matchUids) {
            const profile = await this.getUserProfile(uid);

            if (profile) {
                profiles.push(profile);
            }
        }

        return profiles;
    }

    async updateUserProfile(uid: string, profile: Partial<UserClass>) {
        const profileRef = doc(this.firestore, `users/${uid}`);
        await updateDoc(profileRef, profile);
    }
}