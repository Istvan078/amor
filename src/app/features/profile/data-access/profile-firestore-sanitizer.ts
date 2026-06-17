import { UserClass } from '../../../shared/models/user.model';

export type FirestoreData = Record<string, any>;

const MINIMUM_DATING_AGE = 18;

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

function normalizeLookingForAge(value: unknown) {
    if (!value || typeof value !== 'object') {
        return undefined;
    }

    const range = value as Record<string, unknown>;
    const lower = Number(range['lower']);
    const upper = Number(range['upper']);
    const normalizedLower = Number.isFinite(lower)
        ? Math.max(MINIMUM_DATING_AGE, lower)
        : MINIMUM_DATING_AGE;
    const normalizedUpper = Number.isFinite(upper)
        ? Math.max(normalizedLower, upper)
        : 100;

    return {
        lower: normalizedLower,
        upper: Math.max(normalizedLower, normalizedUpper),
    };
}

function normalizeGenderValue(value: unknown) {
    if (value === 'man' || value === 'Ferfi') {
        return 'man';
    }

    if (value === 'woman' || value === 'No') {
        return 'woman';
    }

    if (value === 'other' || value === 'Egyeb') {
        return 'other';
    }

    return undefined;
}

const RELATIONSHIP_GOALS = new Set([
    'seriousRelationship',
    'seriousOpenMinded',
    'casualOpenToSerious',
    'casualRelationship',
    'newFriends',
    'stillFiguringItOut',
]);

const SEXUAL_ORIENTATIONS = new Set([
    'heterosexual',
    'gay',
    'lesbian',
    'bisexual',
    'asexual',
    'demisexual',
    'pansexual',
    'queer',
    'questioning',
    'aromantic',
    'omnisexual',
]);

function normalizeStringOption(value: unknown, options: Set<string>) {
    return typeof value === 'string' && options.has(value) ? value : undefined;
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
    delete sanitizedProfile['profileVerificationReviewNote'];
    delete sanitizedProfile['profileQualityScore'];
    delete sanitizedProfile['moderationRiskScore'];
    delete sanitizedProfile['moderationRiskReasons'];
    delete sanitizedProfile['lastRiskFlaggedAt'];

    const lookingForAge = normalizeLookingForAge(sanitizedProfile['lookingForAge']);

    if (lookingForAge) {
        sanitizedProfile['lookingForAge'] = lookingForAge;
    }

    const gender = normalizeGenderValue(sanitizedProfile['gender']);
    const lookingForGender = normalizeGenderValue(
        sanitizedProfile['lookingForGender']
    );

    if (gender) {
        sanitizedProfile['gender'] = gender;
    }

    if (lookingForGender) {
        sanitizedProfile['lookingForGender'] = lookingForGender;
    }

    const relationshipGoal = normalizeStringOption(
        sanitizedProfile['lookingForType'],
        RELATIONSHIP_GOALS
    );
    const sexualOrientation = normalizeStringOption(
        sanitizedProfile['sexualOrientation'],
        SEXUAL_ORIENTATIONS
    );

    if (relationshipGoal) {
        sanitizedProfile['lookingForType'] = relationshipGoal;
    } else if (sanitizedProfile['lookingForType'] === '') {
        delete sanitizedProfile['lookingForType'];
    }

    if (sexualOrientation) {
        sanitizedProfile['sexualOrientation'] = sexualOrientation;
    } else {
        delete sanitizedProfile['sexualOrientation'];
    }

    sanitizedProfile['hideAge'] = sanitizedProfile['hideAge'] === true;

    return sanitizedProfile;
}
