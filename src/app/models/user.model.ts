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
 public pictures?: { name: string; url: string }[];
 public interests?: string[];
 public matches?: string[]; // matchelo szemelyek uidk
 constructor() {}

 calcAge() {
  const date = new Date().toLocaleDateString();
  let dateArr: string[] = [];
  if (date.includes('/')) {
   dateArr = date.split('/').reverse();
   const month = dateArr.pop();
   const day = dateArr.pop();
   dateArr.push(month!);
   dateArr.push(day!);
  }
  if (date.includes('-')) dateArr = date.split('-');
  if (date.includes('.')) dateArr = date.split('.');
  let birthDate: any[] = [];
  if (this.birthDate?.includes('-'))
   birthDate = this.birthDate.trim().split('-');
  if (this.birthDate?.includes('/')) {
   birthDate = this.birthDate.trim().split('/').reverse();
   const month = birthDate.pop();
   const day = birthDate.pop();
   birthDate.push(month!);
   birthDate.push(day!);
  }

  if (this.birthDate?.includes('.'))
   birthDate = this.birthDate.trim().split('.');
  const actDateObj = {
   year: Number(dateArr[0].trim().substring(0, 4)),
   month: Number(dateArr[1].trim().substring(0, 2)),
   day: Number(dateArr[2].trim().substring(0, 2)),
  };
  let birthDateObj: any = {};
  if (birthDate?.length) {
   birthDateObj = {
    year: Number(birthDate[0]),
    month: Number(birthDate[1]),
    day: Number(birthDate[2]),
   };
  }

  this.age =
   actDateObj.year -
   birthDateObj.year -
   (birthDateObj.month * 30 - actDateObj.month * 30) / 360;
  this.age = Math.floor(this.age);
  console.log(this.age);
 }
}
