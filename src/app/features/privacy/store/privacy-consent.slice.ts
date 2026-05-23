interface PrivacyConsent {
    readonly essential: boolean,
    readonly crashReports: boolean,
    readonly analytics: boolean,
    readonly personalisation: boolean,
    readonly marketingNotifications: boolean,
    readonly consentVersion: string,
    readonly updatedAt: string
}

export const initialPrivacyConsent: PrivacyConsent = {
    essential: true,
    crashReports: false,
    analytics: false,
    personalisation: false,
    marketingNotifications: false,
    consentVersion: '1.0.0',
    updatedAt: new Date().toISOString()
}