import { Injectable, inject } from '@angular/core';
import {
    Storage,
    deleteObject,
    getDownloadURL,
    ref,
    uploadBytes,
} from '@angular/fire/storage';
import { BehaviorSubject } from 'rxjs';

import { BaseService } from './base.service';
import { ConfigService } from './config.service';

@Injectable({
    providedIn: 'root',
})
export class FilesService {
    private base = inject(BaseService);
    private config = inject(ConfigService);
    private storage = inject(Storage);

    picturesSubject = new BehaviorSubject<any>('');

    async addPictures(uid: string, userProf: any) {
        const selectedFiles = this.config.selectedFilesSubj.value;

        if (!selectedFiles.length) {
            return;
        }

        if (!userProf.pictures?.length) {
            userProf.pictures = [];
        }

        const uploadedFileNames = new Set<string>();

        for (const file of selectedFiles) {
            const picturePath = `pictures/${uid}/${file.name}`;
            const storageRef = ref(this.storage, picturePath);

            await uploadBytes(storageRef, file);

            const url = await getDownloadURL(storageRef);

            const pictureData = {
                url,
                name: file.name,
            };

            if (!uploadedFileNames.has(file.name)) {
                userProf.pictures.push(pictureData);
                uploadedFileNames.add(file.name);
            }

            this.picturesSubject.next(pictureData);
        }

        await this.base.updateUserProf(uid, userProf);
        this.base.userProfBehSubj.next(userProf);

        console.log('All pictures uploaded.');
    }

    async getFileFromStorage(uid: string, fileName: string) {
        const filePath = `pictures/${uid}/${fileName}`;
        const pictureRef = ref(this.storage, filePath);

        return getDownloadURL(pictureRef);
    }

    async deleteFilesFromStorage(path: string, fileName: string) {
        const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
        const filePath = `${normalizedPath}/${fileName}`;
        const storageRef = ref(this.storage, filePath);

        return deleteObject(storageRef);
    }
}