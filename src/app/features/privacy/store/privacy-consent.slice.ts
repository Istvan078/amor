export const CURRENT_PRIVACY_CONSENT_VERSION = '1.0.0';

export interface PrivacyConsent {
    readonly essential: boolean;
    readonly termsAccepted: boolean;
    readonly privacyPolicyAccepted: boolean;
    readonly ageConfirmed: boolean;
    readonly crashReports: boolean;
    readonly analytics: boolean;
    readonly personalisation: boolean;
    readonly marketingNotifications: boolean;
    readonly consentVersion: string;
    readonly updatedAt: string;
}

export type PrivacyConsentState = PrivacyConsent & {
    readonly initialized: boolean;
    readonly loading: boolean;
    readonly error: string | null;
};

export function createInitialPrivacyConsentState(): PrivacyConsentState {
    return {
        essential: true,
        termsAccepted: false,
        privacyPolicyAccepted: false,
        ageConfirmed: false,
        crashReports: false,
        analytics: false,
        personalisation: false,
        marketingNotifications: false,
        consentVersion: CURRENT_PRIVACY_CONSENT_VERSION,
        updatedAt: new Date().toISOString(),
        initialized: false,
        loading: false,
        error: null,
    };
}

export const initialPrivacyConsent = createInitialPrivacyConsentState();

export function isPrivacyConsentAccepted(
    consent: Partial<PrivacyConsent> | null | undefined
) {
    return !!(
        consent?.termsAccepted &&
        consent.privacyPolicyAccepted &&
        consent.ageConfirmed &&
        consent.consentVersion === CURRENT_PRIVACY_CONSENT_VERSION
    );
}
