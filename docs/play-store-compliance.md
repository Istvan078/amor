# Amor Play Store compliance checklist

This checklist tracks app-store and policy items that cannot be fully enforced by
client code alone.

## 18+ access

- Play Console target audience must be set to adults only.
- Content rating questionnaire must describe dating, chat, user-generated
  profiles, user-generated messages, report/block tools, and possible mature
  UGC accurately.
- Onboarding must keep the neutral 18+ gate before account creation.
- Profile creation and updates must keep `birthDateTimestamp` and `age` 18+.
- Backend discovery and match actions must reject under-18 profiles.
- Terms, Privacy Policy, and Community Guidelines must state that Amor is only
  for users who are at least 18 years old.

## Privacy and data safety

- Publish active, non-PDF legal URLs before production submission. The app now
  ships static source pages at:
  - `/assets/legal/privacy-policy.html`
  - `/assets/legal/terms-of-use.html`
  - `/assets/legal/community-guidelines.html`
- Link the hosted Privacy Policy URL from the Play Store listing and keep the
  in-app privacy flow links pointed at the same published documents.
- Data Safety must cover email/auth data, profile photos, birth date/age,
  gender, sexual orientation, relationship goal, location, chat messages, push
  tokens, purchase status, moderation reports, and analytics events.
- The Privacy Policy must explain Firebase, RevenueCat, push notification,
  analytics, and crash reporting data processing.
- Include location disclosure before requesting location permission.
- Account deletion copy must state what is deleted and what may be retained for
  safety, abuse prevention, legal, or moderation review.

## UGC and moderation

- Terms of Use, Privacy Policy, and Community Guidelines must be accepted before
  profile UGC or chat UGC features.
- Objectionable content must be explicitly prohibited.
- Report and block controls must remain visible from profiles and chats.
- Message creation should remain backend-owned through `/sendMessage` so text,
  GIF shape, match state, 18+ consent, and rate limits are enforced before write.
- Reported profile/message content must be retained until moderation review is
  complete, unless legal deletion requirements override it.
- Admin moderation queue should keep clear statuses: open, reviewed, dismissed,
  action_taken.
- Moderation actions should support warning, ban, and appeal/review notes.
- Keep support contact available in app and store listing.

## Android release

- `android:allowBackup` should remain false unless a documented backup policy is
  introduced.
- Verify Android 13+ photo picker or media permissions before release.
- Verify target SDK, signing config, release build, adaptive icon, splash assets,
  and privacy labels before production upload.
