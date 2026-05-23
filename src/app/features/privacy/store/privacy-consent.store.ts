import { signalStore, withState } from "@ngrx/signals";
import { initialPrivacyConsent } from "./privacy-consent.slice";

export const PrivacyConsentStore = signalStore({
    providedIn: 'root'
}, withState(initialPrivacyConsent))