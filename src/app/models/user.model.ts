interface RegistrationDataForLogin {
  email: string;
  password: string;
}

enum LookingFor {
  man = 'Ferfi',
  woman = 'No',
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
  lookingForDistance?: number;
  public highestSchool?: string;
  public lookingFor?: LookingFor;
  public matches?: string[]; // matchelo szemelyek uidk
  constructor() {}
}
