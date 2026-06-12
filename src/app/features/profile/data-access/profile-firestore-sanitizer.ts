import { UserClass } from '../../../shared/models/user.model';

export type FirestoreData = Record<string, any>;

function sanitizeFirestoreValue(value: unknown): unknown {
    if (value === undefined || typeof value === 'function') {
        return undefined;
    }

    if (value === null || typeof value !== 'object') {
        return value;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value
            .map((item) => sanitizeFirestoreValue(item))
            .filter((item) => item !== undefined);
    }

    return Object.entries(value as Record<string, unknown>).reduce<FirestoreData>(
        (result, [key, item]) => {
            const sanitizedValue = sanitizeFirestoreValue(item);

            if (sanitizedValue !== undefined) {
                result[key] = sanitizedValue;
            }

            return result;
        },
        {}
    );
}

export function sanitizeProfileForFirestore(
    profile: Partial<UserClass>
): FirestoreData {
    const sanitizedProfile = sanitizeFirestoreValue(profile) as FirestoreData;

    delete sanitizedProfile['isBanned'];
    delete sanitizedProfile['matchParts'];
    delete sanitizedProfile['profileVerified'];
    delete sanitizedProfile['profileVerificationStatus'];
    delete sanitizedProfile['profileVerifiedAt'];
    delete sanitizedProfile['profileVerifiedBy'];
    delete sanitizedProfile['profileVerificationRequestedAt'];
    delete sanitizedProfile['profileVerificationReviewedAt'];
    delete sanitizedProfile['profileVerificationReviewedBy'];
    delete sanitizedProfile['profileQualityScore'];
    delete sanitizedProfile['moderationRiskScore'];
    delete sanitizedProfile['moderationRiskReasons'];
    delete sanitizedProfile['lastRiskFlaggedAt'];

    return sanitizedProfile;
}
