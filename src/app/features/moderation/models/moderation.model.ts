import { FieldValue } from "@angular/fire/firestore";

export type CreateModerationReportInput = {
    reporterUid: string;
    reportedUid: string;
    reason: string;
    description: string;
    source?: 'profile' | 'conversation' | 'message';
    conversationId?: string;
    messageId?: string;
    messageText?: string;
    messageSentAt?: string;
    messageSenderUid?: string;
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
    source?: 'profile' | 'conversation' | 'message';
    conversationId?: string;
    messageId?: string;
    messageText?: string;
    messageSentAt?: string;
    messageSenderUid?: string;
    createdAt: FieldValue;
    status: ModerationReportStatus;
};
