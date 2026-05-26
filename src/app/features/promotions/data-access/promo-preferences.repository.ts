import { Injectable } from '@angular/core';

export type PromoSheetState = {
    firstSeenAt: number;
    dailyShows: Record<string, number>;
    lastClosedAt?: number;
    lastMaybeLaterAt?: number;
    shownTriggers?: Record<string, number>;
};

@Injectable({
    providedIn: 'root',
})
export class PromoPreferencesRepository {
    readPromoSheetState(uid: string): PromoSheetState {
        const fallbackState = this.createInitialState();

        if (typeof window === 'undefined') {
            return fallbackState;
        }

        try {
            const storedState = window.localStorage.getItem(
                this.getPromoSheetStorageKey(uid)
            );

            if (!storedState) {
                return fallbackState;
            }

            const parsedState = JSON.parse(storedState) as Partial<PromoSheetState>;

            return {
                firstSeenAt: parsedState.firstSeenAt ?? Date.now(),
                dailyShows: parsedState.dailyShows ?? {},
                lastClosedAt: parsedState.lastClosedAt,
                lastMaybeLaterAt: parsedState.lastMaybeLaterAt,
                shownTriggers: parsedState.shownTriggers ?? {},
            };
        } catch (error) {
            console.error(error);
            return fallbackState;
        }
    }

    writePromoSheetState(uid: string, state: PromoSheetState) {
        if (typeof window === 'undefined') {
            return;
        }

        try {
            window.localStorage.setItem(
                this.getPromoSheetStorageKey(uid),
                JSON.stringify(state)
            );
        } catch (error) {
            console.error(error);
        }
    }

    private createInitialState(): PromoSheetState {
        return {
            firstSeenAt: Date.now(),
            dailyShows: {},
            shownTriggers: {},
        };
    }

    private getPromoSheetStorageKey(uid: string) {
        return `amor:mobile-promo-sheet:${uid}`;
    }
}
