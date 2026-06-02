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
import { UserClass } from '../../../shared/models/user.model';
import { AuthStore } from '../../auth/store/auth.store';
import { MatchIndexRepository } from '../../matching/data-access/match-index.repository';

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
        await this.runInFirebaseContext(() => {
            const profileRef = doc(this.firestore, `users/${uid}`);

            return updateDoc(profileRef, profile);
        });

        await this.matchIndexRepository.upsertProfileIndex({
            uid,
            ...profile,
        });
    }

    async updateUserOnlineStatus(uid: string, isOnline: boolean) {
        await this.runInFirebaseContext(() => {
            const profileRef = doc(this.firestore, `users/${uid}`);

            return updateDoc(profileRef, {
                isOnline,
                lastSeenAt: new Date().toISOString(),
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
