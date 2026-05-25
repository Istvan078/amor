import { User } from '@angular/fire/auth';

export type FirebaseUser = User | null;

interface RegistrationDataForLogin {
  email: string;
  password: string;
}

export enum LookingFor {
  man = 'Ferfi',
  woman = 'No',
  other = 'Egyeb',
}

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

export class UserClass {
  [key: string]: any;

  public uid?: string;
  public email?: string;
  private loginData?: RegistrationDataForLogin;

  public gender?: 'No' | 'Ferfi' | 'Egyeb';
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
  public currStudy?: string;
  public studies?: Study;
  public freeTimeAct?: string[];
  public zodiacSign?: string;

  public lookingForDistance?: number;
  public lookingForAge: {
    lower: number;
    upper: number;
  } = {
      lower: 18,
      upper: 80,
    };

  public highestSchool?: string;
  public lookingForGender?: LookingFor;
  public aboutMe?: string;
  public lookingForType?: string;

  public profilePicture?: string;
  public pictures?: {
    name: string;
    url: string;
  }[];

  public interests?: string[];
  public matchParts?: MatchParts;
  public subscriptions?: UserSubscription;
  public isOnline?: boolean;
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
  possMatches: string[];
  liked: string[];
  notLiked: string[];
  superLiked: string[];

  constructor() {
    this.matches = [];
    this.possMatches = [];
    this.liked = [];
    this.notLiked = [];
    this.superLiked = [];
  }
}
