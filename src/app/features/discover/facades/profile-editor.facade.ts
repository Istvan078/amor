import { Injectable, inject } from '@angular/core';

import { ConfigService } from '../../../services/config.service';
import { UserClass } from '../../../shared/models/user.model';
import { ProfilePicturesRepository } from '../../profile/data-access/profile-pictures.repository';
import { ProfileVerificationRepository } from '../../profile/data-access/profile-verification.repository';
import { ProfileStore } from '../../profile/store/profile.store';
import {
  getProfileCompleteness,
  isProfileCompleteForDiscovery,
} from '../../profile/utils/profile-completeness';

type ProfilePicture = NonNullable<UserClass['pictures']>[number];

@Injectable({
  providedIn: 'root',
})
export class ProfileEditorFacade {
  readonly maxProfilePictures = 6;
  private readonly minimumDatingAge = 18;

  private config = inject(ConfigService);
  private profilePicturesRepository = inject(ProfilePicturesRepository);
  private profileStore = inject(ProfileStore);
  private profileVerificationRepository = inject(ProfileVerificationRepository);

  selectedFiles() {
    return this.config.selectedFiles();
  }

  clearSelectedFiles() {
    this.config.clearSelectedFiles();
  }

  profile() {
    return this.profileStore.profile();
  }

  setProfile(profile: UserClass) {
    this.profileStore.setProfile(profile);
  }

  updateProfile(uid: string, profile: Partial<UserClass> & { uid?: string }) {
    return this.profileStore.updateProfile(uid, profile);
  }

  buildEditableProfilePayload(
    profile: UserClass,
    uid: string
  ): Partial<UserClass> & { uid: string } {
    return {
      uid,

      firstName: profile.firstName,
      lastName: profile.lastName,
      birthDate: profile.birthDate,
      age: profile.age,
      gender: profile.gender,

      aboutMe: profile.aboutMe,
      lookingForType: profile.lookingForType,
      lookingForGender: profile.lookingForGender,
      lookingForAge: this.normalizeLookingForAge(profile.lookingForAge),
      lookingForDistance: profile.lookingForDistance,

      job: profile.job,
      heightCm: profile.heightCm,
      currStudy: profile.currStudy,
      studies: profile.studies,
      highestSchool: profile.highestSchool,
      freeTimeAct: profile.freeTimeAct,
      interests: profile.interests,
      zodiacSign: profile.zodiacSign,
      familyPlans: profile.familyPlans,
      communicationStyle: profile.communicationStyle,
      loveStyle: profile.loveStyle,
      pets: profile.pets,
      drinking: profile.drinking,
      smoking: profile.smoking,
      workout: profile.workout,
      socialMedia: profile.socialMedia,
      anthemTitle: profile.anthemTitle,
      anthemArtist: profile.anthemArtist,
      anthemAlbum: profile.anthemAlbum,
      anthemImageUrl: profile.anthemImageUrl,
      anthemUrl: profile.anthemUrl,

      currentPlace: profile.currentPlace,
      currentLocCoords: profile.currentLocCoords,

      profilePicture: profile.profilePicture,
      pictures: profile.pictures,

      isVisible: profile.isVisible,
      showOnlineStatus: profile.showOnlineStatus,
      distanceVisibility: profile.distanceVisibility,
      readReceiptsEnabled: profile.readReceiptsEnabled,

      notificationPreferences: profile.notificationPreferences,
      notificationDelivery: profile.notificationDelivery,
      notificationQuietHours: profile.notificationQuietHours,
    };
  }

  getProfileCompletionPercent(profile: Partial<UserClass>) {
    return getProfileCompleteness(profile);
  }

  isProfileReadyForDiscovery(profile?: Partial<UserClass> | null) {
    return isProfileCompleteForDiscovery(profile);
  }

  hasRequiredProfilePictures(profile?: UserClass | null) {
    return (profile?.pictures?.length ?? 0) >= 1;
  }

  private normalizeLookingForAge(
    range: UserClass['lookingForAge'] | undefined
  ) {
    const lower = Number(range?.lower);
    const upper = Number(range?.upper);
    const normalizedLower = Number.isFinite(lower)
      ? Math.max(this.minimumDatingAge, lower)
      : this.minimumDatingAge;
    const normalizedUpper = Number.isFinite(upper)
      ? Math.max(normalizedLower, upper)
      : 100;

    return {
      lower: normalizedLower,
      upper: Math.max(normalizedLower, normalizedUpper),
    };
  }

  async savePictures(
    profile: UserClass,
    selectedFiles: File[],
    uid = profile.uid
  ) {
    if (!uid || !selectedFiles.length) {
      return profile;
    }

    const availableSlots = Math.max(
      this.maxProfilePictures - (profile.pictures?.length ?? 0),
      0
    );

    if (availableSlots <= 0) {
      this.clearSelectedFiles();
      return profile;
    }

    const updatedProfile = await this.profilePicturesRepository.addPictures(
      uid,
      profile,
      selectedFiles.slice(0, availableSlots)
    );

    const persisted = await this.persistProfilePictures(
      profile,
      updatedProfile.pictures ?? [],
      updatedProfile.profilePicture,
      uid
    );

    this.clearSelectedFiles();
    return persisted ?? profile;
  }

  async requestProfileVerification(
    profile: UserClass,
    selfieFile: File,
    uid = profile.uid
  ) {
    if (!uid || !selfieFile) {
      return profile;
    }

    const response =
      await this.profileVerificationRepository.requestProfileVerification(
        uid,
        selfieFile
      );
    const nextProfile = {
      ...profile,
      profileVerificationStatus: response.status,
      profileVerified: response.status === 'approved',
      profileVerificationRequestedAt: new Date().toISOString(),
    } as UserClass;

    this.profileStore.setProfile(nextProfile);
    return nextProfile;
  }

  async reorderProfilePhotos(
    profile: UserClass,
    event: { fromIndex: number; toIndex: number },
    uid = profile.uid
  ) {
    const pictures = this.normalizeProfilePictures(profile.pictures);

    if (
      !uid ||
      !pictures.length ||
      event.fromIndex < 0 ||
      event.toIndex < 0 ||
      event.fromIndex >= pictures.length ||
      event.toIndex >= pictures.length ||
      event.fromIndex === event.toIndex
    ) {
      return profile;
    }

    const reorderedPictures = [...pictures];
    const [movedPicture] = reorderedPictures.splice(event.fromIndex, 1);

    if (!movedPicture) {
      return profile;
    }

    reorderedPictures.splice(event.toIndex, 0, movedPicture);

    return (
      (await this.persistProfilePictures(
        profile,
        reorderedPictures,
        profile.profilePicture,
        uid
      )) ?? profile
    );
  }

  async selectPrimaryProfilePhoto(profile: UserClass, index: number, uid = profile.uid) {
    const pictures = this.normalizeProfilePictures(profile.pictures);
    const selectedPicture = pictures[index];

    if (!uid || !selectedPicture) {
      return profile;
    }

    return (
      (await this.persistProfilePictures(
        profile,
        pictures,
        selectedPicture.url,
        uid
      )) ?? profile
    );
  }

  async deleteProfilePhoto(profile: UserClass, index: number, uid = profile.uid) {
    const pictures = this.normalizeProfilePictures(profile.pictures);

    if (!uid || pictures.length <= 1 || index < 0 || index >= pictures.length) {
      return profile;
    }

    const removedPicture = pictures[index];

    if (!removedPicture) {
      return profile;
    }

    const remainingPictures = pictures.filter(
      (_, pictureIndex) => pictureIndex !== index
    );
    const nextPrimaryPicture =
      profile.profilePicture === removedPicture.url
        ? remainingPictures[0]?.url
        : profile.profilePicture;

    try {
      await this.profilePicturesRepository.deleteFilesFromStorage(
        `publicPictures/${uid}`,
        removedPicture.name
      );
    } catch (error) {
      console.warn('Failed to delete profile picture from storage', error);
    }

    return (
      (await this.persistProfilePictures(
        profile,
        remainingPictures,
        nextPrimaryPicture,
        uid
      )) ?? profile
    );
  }

  private normalizeProfilePictures(pictures: ProfilePicture[] = []) {
    return pictures
      .filter((picture) => !!picture?.url && !!picture?.name)
      .slice(0, this.maxProfilePictures);
  }

  private async persistProfilePictures(
    profile: UserClass,
    pictures: ProfilePicture[],
    preferredPrimaryUrl?: string,
    uid = profile.uid
  ) {
    if (!uid) {
      return null;
    }

    const normalizedPictures = this.normalizeProfilePictures(pictures);

    if (!normalizedPictures.length) {
      return null;
    }

    const primaryPicture = normalizedPictures.some(
      (picture) => picture.url === preferredPrimaryUrl
    )
      ? preferredPrimaryUrl
      : normalizedPictures[0]?.url;

    const nextProfile = {
      ...profile,
      pictures: normalizedPictures,
      profilePicture: primaryPicture,
    } as UserClass;

    const profileSaved = await this.profileStore.updateProfile(uid, {
      pictures: normalizedPictures,
      profilePicture: primaryPicture,
    });

    if (!profileSaved) {
      return null;
    }

    return this.profileStore.profile() ?? nextProfile;
  }
}
