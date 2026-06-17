import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
    Firestore,
    doc,
    getDoc,
    updateDoc,
} from '@angular/fire/firestore';

import { PublicProfile } from '../../../shared/models/public-profile.model';
import { UserClass } from '../../../shared/models/user.model';
import { MatchIndexRepository } from '../../matching/data-access/match-index.repository';
import { sanitizeProfileForFirestore } from '../../profile/data-access/profile-firestore-sanitizer';

@Injectable({
    providedIn: 'root',
})
export class DiscoverRepository {
    private injector = inject(Injector);
    private firestore = inject(Firestore);
    private matchIndexRepository = inject(MatchIndexRepository);

    async getUserProfile(uid: string): Promise<UserClass | undefined> {
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

    async getPublicProfile(uid: string): Promise<PublicProfile | undefined> {
        const snapshot = await this.runInFirebaseContext(() => {
            const profileRef = doc(this.firestore, `publicProfiles/${uid}`);

            return getDoc(profileRef);
        });

        if (!snapshot.exists()) {
            return undefined;
        }

        return {
            uid: snapshot.id,
            ...snapshot.data(),
        } as PublicProfile;
    }

    async getPossibleMatchProfile(uid: string): Promise<PublicProfile | undefined> {
        return this.getPublicProfile(uid);
    }

    async getMatchProfiles(matchUids: string[]): Promise<PublicProfile[]> {
        const uniqueMatchUids = matchUids.filter(
            (uid, index, allUids) =>
                typeof uid === 'string' && !!uid && allUids.indexOf(uid) === index
        );
        const profilesByUid = new Map<string, PublicProfile>();
        const chunkSize = 10;

        for (let index = 0; index < uniqueMatchUids.length; index += chunkSize) {
            const uidChunk = uniqueMatchUids.slice(index, index + chunkSize);
            const profiles = await Promise.all(
                uidChunk.map((uid) => this.getPublicProfile(uid))
            );

            profiles.forEach((profile) => {
                if (profile?.uid) {
                    profilesByUid.set(profile.uid, profile);
                }
            });
        }

        return uniqueMatchUids
            .map((uid) => profilesByUid.get(uid))
            .filter((profile): profile is PublicProfile => !!profile);
    }

    async updateUserProfile(uid: string, profile: Partial<UserClass>) {
        const profileUpdate = sanitizeProfileForFirestore(profile);

        await this.runInFirebaseContext(() => {
            const profileRef = doc(this.firestore, `users/${uid}`);

            return updateDoc(profileRef, profileUpdate);
        });

        try {
            await this.matchIndexRepository.upsertProfileIndex({
                uid,
                ...profile,
            });
        } catch (error) {
            console.warn('Profile was updated, but index sync failed.', error);
        }
    }

    async updateUserOnlineStatus(
        uid: string,
        isOnline: boolean,
        showOnlineStatus = false
    ) {
        const now = new Date().toISOString();
        const presenceUpdate = {
            isOnline,
            lastSeenAt: now,
            lastActiveAt: now,
        };

        await this.runInFirebaseContext(async () => {
            const profileRef = doc(this.firestore, `users/${uid}`);
            const updates: Promise<unknown>[] = [
                updateDoc(profileRef, presenceUpdate),
            ];

            if (showOnlineStatus) {
                const publicProfileRef = doc(this.firestore, `publicProfiles/${uid}`);

                updates.push(
                    updateDoc(publicProfileRef, presenceUpdate).catch(() => undefined)
                );
            }

            return Promise.all(updates);
        });
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
