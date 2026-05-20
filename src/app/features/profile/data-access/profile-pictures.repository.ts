import { Injectable, inject } from '@angular/core';
import {
    Storage,
    deleteObject,
    getDownloadURL,
    ref,
    uploadBytes,
} from '@angular/fire/storage';

import { UserClass } from '../../../shared/models/user.model';
import { ProfileRepository } from './profile.repository';

@Injectable({
    providedIn: 'root',
})
export class ProfilePicturesRepository {
    private storage = inject(Storage);
    private profileRepository = inject(ProfileRepository);

    async addPictures(uid: string, userProfile: UserClass, files: File[]) {
        if (!files.length) {
            return userProfile;
        }

        if (!userProfile.pictures?.length) {
            userProfile.pictures = [];
        }

        const uploadedFileNames = new Set(
            userProfile.pictures.map((picture) => picture.name)
        );

        for (const file of files) {
            const picturePath = `pictures/${uid}/${file.name}`;
            const storageRef = ref(this.storage, picturePath);

            await uploadBytes(storageRef, file);

            const url = await getDownloadURL(storageRef);

            if (!uploadedFileNames.has(file.name)) {
                userProfile.pictures.push({
                    url,
                    name: file.name,
                });
                uploadedFileNames.add(file.name);
            }
        }

        const profileData =
            typeof userProfile.setDataForFireStore === 'function'
                ? userProfile.setDataForFireStore()
                : {
                      ...userProfile,
                      matchParts: userProfile.matchParts
                          ? { ...userProfile.matchParts }
                          : undefined,
                  };

        await this.profileRepository.updateProfile(uid, profileData);

        return userProfile;
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
