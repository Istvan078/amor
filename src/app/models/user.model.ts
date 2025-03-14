interface RegistrationDataForLogin {
  email: string;
  password: string;
}

enum LookingFor {
  man = 'Ferfi',
  woman = 'No',
}

interface Study {
  location: string;
  topic: string;
  from: string;
  until: string;
}

export class UserClass {
  [key: string]: any;
  public uid?: string;
  public email?: string;
  private loginData?: RegistrationDataForLogin;
  public gender?: string;
  public firstName?: string;
  public lastName?: string;
  public birthDate?: string;
  public age?: number;
  public currentPlace?: string;
  public job?: string;
  public currStudy?: string;
  public studies?: Study;
  public freeTimeAct?: string[];
  public zodiacSign?: string;
  public lookingForDistance?: number;
  public highestSchool?: string;
  public lookingFor?: LookingFor;
  public aboutMe?: string;
  public lookingForType?: string;
  public profilePicture?: string;
  public pictures?: string[];
  public interests?: string[];
  public matches?: string[]; // matchelo szemelyek uidk
  constructor() {}
}
