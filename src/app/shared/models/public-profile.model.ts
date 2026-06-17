export type PublicProfilePicture = {
  url: string;
  name?: string;
  thumbnailUrl?: string;
  imageModerationStatus?: 'approved' | 'rejected' | 'review_required';
};

export type PublicProfile = {
  [key: string]: unknown;

  uid: string;
  firstName?: string;
  age?: number;
  gender?: string;
  aboutMe?: string;
  lookingForType?: string;
  sexualOrientation?: string;
  hideAge?: boolean;
  lookingForGender?: string;
  lookingForAge?: {
    lower: number;
    upper: number;
  };
  profilePicture?: string;
  pictures?: PublicProfilePicture[];
  interests?: string[];
  freeTimeAct?: string[];
  job?: string;
  heightCm?: number;
  currStudy?: string;
  highestSchool?: string;
  zodiacSign?: string;
  familyPlans?: string;
  communicationStyle?: string;
  loveStyle?: string;
  pets?: string;
  drinking?: string;
  smoking?: string;
  workout?: string;
  socialMedia?: string;
  anthemTitle?: string;
  anthemArtist?: string;
  anthemAlbum?: string;
  anthemImageUrl?: string;
  anthemUrl?: string;
  currentPlace?: string;
  distanceVisibility?: boolean;
  showOnlineStatus?: boolean;
  distanceKm?: number | null;
  sharedInterestCount?: number;
  isOnline?: boolean;
  lastSeenAt?: unknown;
  lastActiveAt?: unknown;
  profileVerified?: boolean;
  profileVerificationStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  profileCompleted?: boolean;
  profileCompleteness?: number;
  createdAt?: unknown;
};
