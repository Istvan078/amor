import { PartialStateUpdater } from "@ngrx/signals";
import { ModerationState } from "./moderation.slice";

export function setModerationLoading(): PartialStateUpdater<ModerationState> {
    return (_) => {
        return {
            loading: true,
            error: null
        }
    };
}

export function setModerationLoaded(): PartialStateUpdater<ModerationState> {
    return (_) => ({
        loading: false,
        error: null
    });
}

export function setModerationLastReport(report: ModerationState['lastReport']): PartialStateUpdater<ModerationState> {
    return (_) => ({
        loading: false,
        error: null,
        lastReport: report
    })
}

export function setModerationError(error: string): PartialStateUpdater<ModerationState> {
    return (_) => ({
        loading: false,
        error
    });
}