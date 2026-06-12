import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
    Firestore,
    doc,
    getDoc,
    updateDoc,
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { PublicProfile } from '../../../shared/models/public-profile.model';
import { UserClass } from '../../../shared/models/user.model';
import { AuthStore } from '../../auth/store/auth.store';
import { MatchIndexRepository } from '../../matching/data-access/match-index.repository';
import { sanitizeProfileForFirestore } from '../../profile/data-access/profile-firestore-sanitizer';

export type CreateMutualMatchResponse = {
    matched: boolean;
    created: boolean;
    matchParts?: UserClass['matchParts'];
};

@Injectable({
    providedIn: 'root',
})
export class DiscoverRepository {
    private injector = inject(Injector);
    private firestore = inject(Firestore);
    private http = inject(HttpClient);
    private authStore = inject(AuthStore);
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
        const profiles: PublicProfile[] = [];

        for (const uid of matchUids) {
            const profile = await this.getPublicProfile(uid);

            if (profile) {
                profiles.push(profile);
            }
        }

        return profiles;
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

    async updateUserOnlineStatus(uid: string, isOnline: boolean) {
        await this.runInFirebaseContext(() => {
            const profileRef = doc(this.firestore, `users/${uid}`);
            const now = new Date().toISOString();

            return updateDoc(profileRef, {
                isOnline,
                lastSeenAt: now,
                lastActiveAt: now,
            });
        });
    }

    async createMutualMatch(
        otherUid: string
    ): Promise<CreateMutualMatchResponse> {
        const user = this.authStore.user();
        const idToken = await this.getIdToken();

        if (!user?.uid || !idToken) {
            return {
                matched: false,
                created: false,
            };
        }

        return firstValueFrom(
            this.http.post<CreateMutualMatchResponse>(
                `${environment.API_URL}createMutualMatch`,
                {
                    uid: user.uid,
                    otherUid,
                },
                {
                    headers: new HttpHeaders().set('Authorization', idToken),
                }
            )
        );
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }

    private async getIdToken() {
        const user = this.authStore.user();
        const rawUser = user?.raw as
            | { getIdToken?: (forceRefresh?: boolean) => Promise<string> }
            | undefined;

        if (rawUser?.getIdToken) {
            return rawUser.getIdToken();
        }

        return user?.idToken;
    }
}
