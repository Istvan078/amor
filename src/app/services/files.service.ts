import { inject, Injectable } from '@angular/core';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { BehaviorSubject, finalize } from 'rxjs';
import { BaseService } from './base.service';
import { ConfigService } from './config.service';

@Injectable({
 providedIn: 'root',
})
export class FilesService {
 private base = inject(BaseService);
 private config = inject(ConfigService);
 private fireStorage = inject(AngularFireStorage);
 picturesSubject: BehaviorSubject<any> = new BehaviorSubject('');
 constructor() {}

 addPictures(uid: string, userProf: any) {
  const selectedFiles = this.config.selectedFilesSubj.value;
  let fileNameArr: any[] = [];
  selectedFiles.map((file, i, arr) => {
   const picturesPath = `pictures/${uid}/${file.name}`;
   const storageRef = this.fireStorage.ref(picturesPath);
   const upload = this.fireStorage.upload(picturesPath, file);
   //    storageRef.list().subscribe((list) => console.log(list));
   const sub = upload
    .snapshotChanges()
    .pipe(
     finalize(() => {
      storageRef.getDownloadURL().subscribe(async (url: string) => {
       const obj = {
        url,
        name: file.name,
       };
       if (!userProf?.pictures?.length) userProf.pictures = [];
       if (!fileNameArr.includes(obj.name)) {
        userProf.pictures.push(obj);
        fileNameArr.push(obj.name);
       }
       if (fileNameArr.length === arr.length) {
        await this.base.updateUserProf(uid, userProf);
        this.base.userProfBehSubj.next(userProf);
        console.log(`Osszes Kep feltoltve`);
       }
       console.log(i);
       this.picturesSubject.next(obj);
       sub.unsubscribe();
      });
     })
    )
    .subscribe();
   return upload.percentageChanges();
  });
 }

 getFileFromStorage(uid: string, fileName: string) {
  const filePath = `pictures/${uid}/${fileName}`;
  const pictureRef = this.fireStorage.ref(filePath);
  return pictureRef.getDownloadURL();
 }

 deleteFilesFromStorage(path: string, fileName: any) {
  const howManySlash = path.split('/');
  let mainPath: string = '';
  let filePath: string = '';
  if (howManySlash.length === 1 || !howManySlash.length)
   filePath = `${path}/${fileName}`;
  if (howManySlash.length === 2) {
   mainPath = howManySlash.join('/');
   filePath = `${mainPath}/${fileName}`;
  }
  if (howManySlash.length === 3) {
   mainPath = howManySlash.join('/');
   filePath = `${mainPath}/${fileName}`;
  }

  console.log(filePath);
  const storageRef = this.fireStorage.ref(filePath);
  console.log(storageRef);
  return storageRef.delete();
 }
}
