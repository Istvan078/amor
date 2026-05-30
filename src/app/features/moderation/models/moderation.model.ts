import { FieldValue } from "@angular/fire/firestore";

export type CreateModerationReportInput = {
    reporterUid: string;
    reportedUid: string;
    reason: string;
    description: string;
};

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
    createdAt: FieldValue;
    status: ModerationReportStatus;
};
