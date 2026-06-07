import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
    Firestore,
    collection,
    doc,
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
        return this.removeMatchWithFunction(myUid, otherUid);
    }

    private async removeMatchWithFunction(myUid: string, otherUid: string) {
        const idToken = await this.auth.currentUser?.getIdToken();

        if (!idToken) {
            throw new Error('moderation.errors.authRequired');
        }

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
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
