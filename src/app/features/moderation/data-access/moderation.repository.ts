import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
    Firestore,
    collection,
    doc,
    runTransaction,
    serverTimestamp,
    setDoc,
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { CreateModerationReportInput, ModerationReport } from '../models/moderation.model';

@Injectable({
    providedIn: 'root',
})
export class ModerationRepository {
    private injector = inject(Injector);
    private firestore = inject(Firestore);
    private auth = inject(Auth);
    private http = inject(HttpClient);

    async createReport(input: CreateModerationReportInput) {
        return this.runInFirebaseContext(async () => {
            const reportsCollection = collection(this.firestore, 'reports');
            const reportRef = doc(reportsCollection);
            const report: ModerationReport = {
                reportId: reportRef.id,
                ...input,
                createdAt: serverTimestamp(),
                status: 'open',
            };

            await setDoc(reportRef, report);

            return report;
        });
    }

    async removeMatchForBothUsers(myUid: string, otherUid: string) {
        const remoteMatchParts = await this.removeMatchWithFunction(myUid, otherUid);

        if (remoteMatchParts) {
            return remoteMatchParts;
        }

        return this.removeMatchWithTransaction(myUid, otherUid);
    }

    private async removeMatchWithFunction(myUid: string, otherUid: string) {
        const idToken = await this.auth.currentUser?.getIdToken();

        if (!idToken) {
            return undefined;
        }

        try {
            const response = await firstValueFrom(
                this.http.post<{ matchParts: Record<string, string[] | undefined> }>(
                    `${environment.API_URL}removeMatch`,
                    {
                        uid: myUid,
                        otherUid,
                    },
                    {
                        headers: new HttpHeaders().set('Authorization', idToken),
                    }
                )
            );

            return response.matchParts;
        } catch (error) {
            console.warn('Falling back to client-side unmatch.', error);
            return undefined;
        }
    }

    private async removeMatchWithTransaction(myUid: string, otherUid: string) {
        return this.runInFirebaseContext(() =>
            runTransaction(this.firestore, async (transaction) => {
                const myProfileRef = doc(this.firestore, `users/${myUid}`);
                const otherProfileRef = doc(this.firestore, `users/${otherUid}`);
                const myProfileSnapshot = await transaction.get(myProfileRef);
                const otherProfileSnapshot = await transaction.get(otherProfileRef);

                if (!myProfileSnapshot.exists()) {
                    throw new Error('moderation.errors.profileNotFound');
                }

                const myData = myProfileSnapshot.data() as {
                    matchParts?: Record<string, string[] | undefined>;
                };
                const otherData = otherProfileSnapshot.data() as
                    | { matchParts?: Record<string, string[] | undefined> }
                    | undefined;
                const myMatchParts = { ...(myData.matchParts ?? {}) };
                const otherMatchParts = { ...(otherData?.matchParts ?? {}) };
                const nextMyMatchParts = {
                    ...myMatchParts,
                    matches: this.withoutUid(myMatchParts['matches'], otherUid),
                    liked: this.withoutUid(myMatchParts['liked'], otherUid),
                    superLiked: this.withoutUid(myMatchParts['superLiked'], otherUid),
                    notLiked: this.withUniqueUid(myMatchParts['notLiked'], otherUid),
                };

                transaction.update(myProfileRef, {
                    matchParts: nextMyMatchParts,
                });

                if (otherProfileSnapshot.exists()) {
                    transaction.update(otherProfileRef, {
                        'matchParts.matches': this.withoutUid(
                            otherMatchParts['matches'],
                            myUid
                        ),
                    });
                }

                return nextMyMatchParts;
            })
        );
    }

    private withoutUid(values: string[] | undefined, uid: string) {
        return (Array.isArray(values) ? values : []).filter((value) => value !== uid);
    }

    private withUniqueUid(values: string[] | undefined, uid: string) {
        const nextValues = Array.isArray(values) ? [...values] : [];

        if (!nextValues.includes(uid)) {
            nextValues.push(uid);
        }

        return nextValues;
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
