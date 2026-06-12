export type PublicProfilePicture = {
  url: string;
  name?: string;
};

export type PublicProfile = {
  [key: string]: unknown;

  uid: string;
  firstName?: string;
  age?: number;
  gender?: string;
  aboutMe?: string;
  lookingForType?: string;
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
  currStudy?: string;
  highestSchool?: string;
  zodiacSign?: string;
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
