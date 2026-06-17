import { User } from '@angular/fire/auth';

export type FirebaseUser = User | null;

interface RegistrationDataForLogin {
  email: string;
  password: string;
}

export enum LookingFor {
  man = 'man',
  woman = 'woman',
  other = 'other',
}

export type GenderValue = 'man' | 'woman' | 'other' | 'Ferfi' | 'No' | 'Egyeb';

interface Study {
  location: string;
  topic: string;
  from: string;
  until: string;
}

interface UserSubscription {
  gold: boolean;
  silver: boolean;
  bronze: boolean;
}

export interface NotificationPreferences {
  newMatches?: boolean;
  newMessages?: boolean;
  superLikes?: boolean;
  promotions?: boolean;
}

export interface NotificationDeliveryPreferences {
  inApp?: boolean;
  push?: boolean;
}

export interface NotificationQuietHours {
  enabled?: boolean;
  start?: string;
  end?: string;
  timeZone?: string;
}

export class UserClass {
  [key: string]: any;

  public uid?: string;
  public email?: string;
  private loginData?: RegistrationDataForLogin;

  public gender?: GenderValue;
  public firstName?: string;
  public lastName?: string;
  public birthDate?: string;
  public age?: number;

  public currentPlace?: string;
  public currentLocCoords?: {
    lat: number;
    lon: number;
  };

  public job?: string;
  public heightCm?: number;
  public currStudy?: string;
  public studies?: Study;
  public freeTimeAct?: string[];
  public zodiacSign?: string;
  public familyPlans?: string;
  public communicationStyle?: string;
  public loveStyle?: string;
  public pets?: string;
  public drinking?: string;
  public smoking?: string;
  public workout?: string;
  public socialMedia?: string;
  public anthemTitle?: string;
  public anthemArtist?: string;
  public anthemAlbum?: string;
  public anthemImageUrl?: string;
  public anthemUrl?: string;

  public lookingForDistance?: number;
  public lookingForAge: {
    lower: number;
    upper: number;
  } = {
      lower: 18,
      upper: 80,
    };

  public highestSchool?: string;
  public lookingForGender?: LookingFor | GenderValue;
  public aboutMe?: string;
  public lookingForType?: string;

  public profilePicture?: string;
  public pictures?: {
    name: string;
    url: string;
    thumbnailUrl?: string;
    imageModerationStatus?: 'approved' | 'rejected' | 'review_required';
  }[];

  public interests?: string[];
  public matchParts?: MatchParts;
  public subscriptions?: UserSubscription;
  public isOnline?: boolean;
  public isVisible?: boolean;
  public showOnlineStatus?: boolean;
  public distanceVisibility?: boolean;
  public readReceiptsEnabled?: boolean;
  public notificationPreferences?: NotificationPreferences;
  public notificationDelivery?: NotificationDeliveryPreferences;
  public notificationQuietHours?: NotificationQuietHours;
  public isBanned?: boolean;
  public profileVerified?: boolean;
  public profileVerificationStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  public profileVerifiedAt?: unknown;
  public profileVerificationRequestedAt?: unknown;
  public profileVerificationReviewNote?: string;
  public profileQualityScore?: number;
  public moderationRiskScore?: number;
  public moderationRiskReasons?: string[];
  public profileCompleted?: boolean;
  public profileCompleteness?: number;
  public blockedUsers?: string[];
  public reportedUsers?: string[];

  constructor() { }

  calcAge() {
    if (!this.birthDate) {
      return;
    }

    const birthDate = new Date(this.birthDate);

    if (Number.isNaN(birthDate.getTime())) {
      return;
    }

    const today = new Date();

    let age = today.getFullYear() - birthDate.getFullYear();

    const hasBirthdayPassedThisYear =
      today.getMonth() > birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() &&
        today.getDate() >= birthDate.getDate());

    if (!hasBirthdayPassedThisYear) {
      age--;
    }

    this.age = age;
  }

  setDataForFireStore() {
    const userProfCopy = { ...this };

    if (this.matchParts) {
      userProfCopy.matchParts = { ...this.matchParts };
    }

    return userProfCopy;
  }
}

export class MatchParts {
  matches: string[];
  liked: string[];
  notLiked: string[];
  superLiked: string[];

  constructor() {
    this.matches = [];
    this.liked = [];
    this.notLiked = [];
    this.superLiked = [];
  }
}
