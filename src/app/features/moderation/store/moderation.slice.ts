import { ModerationReport } from "../models/moderation.model";

export type ModerationState = {
    loading: boolean;
    error: string | null;
    lastReport: ModerationReport | null;
};

export const initialModerationState: ModerationState = {
    loading: false,
    error: null,
    lastReport: null,
};