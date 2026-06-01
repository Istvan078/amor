import { UserClass } from '../../../shared/models/user.model';

export const PROFILE_COMPLETENESS_DISCOVERY_THRESHOLD = 70;

export function getProfileCompleteness(profile: Partial<UserClass> | null | undefined) {
    if (!profile) {
        return 0;
    }

    const hasPhoto = !!profile.profilePicture || !!profile.pictures?.length;
    const hasLocation =
        !!profile.currentPlace ||
        (
            Number.isFinite(Number(profile.currentLocCoords?.lat)) &&
            Number.isFinite(Number(profile.currentLocCoords?.lon))
        );
    const hasCoreIdentity =
        !!profile.birthDate &&
        !!profile.gender &&
        !!profile.lookingForGender;

    const score =
        (hasPhoto ? 30 : 0) +
        (profile.aboutMe ? 20 : 0) +
        (profile.lookingForType ? 15 : 0) +
        (profile.interests?.length ? 15 : 0) +
        (hasLocation ? 10 : 0) +
        (hasCoreIdentity ? 10 : 0);

    return Math.min(score, 100);
}

export function isProfileCompleteForDiscovery(
    profile: Partial<UserClass> | null | undefined
) {
    return getProfileCompleteness(profile) >= PROFILE_COMPLETENESS_DISCOVERY_THRESHOLD;
}

export function hasProfilePhoto(profile: Partial<UserClass> | null | undefined) {
    return !!profile?.profilePicture || !!profile?.pictures?.length;
}
