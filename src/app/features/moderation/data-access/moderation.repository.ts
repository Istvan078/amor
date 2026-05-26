import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
    Firestore,
    collection,
    doc,
    setDoc,
} from '@angular/fire/firestore';

export type ModerationReportStatus =
    | 'open'
    | 'reviewed'
    | 'dismissed'
    | 'action_taken';

export type ModerationReport = {
    reportId: string;
    reporterUid: string;
    reportedUid: string;
    reason: string;
    description: string;
    createdAt: string;
    status: ModerationReportStatus;
};

export type CreateModerationReportInput = {
    reporterUid: string;
    reportedUid: string;
    reason: string;
    description: string;
};

@Injectable({
    providedIn: 'root',
})
export class ModerationRepository {
    private injector = inject(Injector);
    private firestore = inject(Firestore);

    async createReport(input: CreateModerationReportInput) {
        return this.runInFirebaseContext(async () => {
            const reportsCollection = collection(this.firestore, 'reports');
            const reportRef = doc(reportsCollection);
            const report: ModerationReport = {
                reportId: reportRef.id,
                ...input,
                createdAt: new Date().toISOString(),
                status: 'open',
            };

            await setDoc(reportRef, report);

            return report;
        });
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
