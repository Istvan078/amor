import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
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
    private injector = inject(Injector);
    private storage = inject(Storage);
    private profileRepository = inject(ProfileRepository);
    private readonly maxPictures = 6;

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
            if (
                userProfile.pictures.length >= this.maxPictures ||
                uploadedFileNames.has(file.name)
            ) {
                continue;
            }

            const picturePath = `pictures/${uid}/${file.name}`;
            const storageRef = this.runInFirebaseContext(() =>
                ref(this.storage, picturePath)
            );

            await this.runInFirebaseContext(() => uploadBytes(storageRef, file));

            const url = await this.runInFirebaseContext(() =>
                getDownloadURL(storageRef)
            );

            userProfile.pictures.push({
                url,
                name: file.name,
            });
            uploadedFileNames.add(file.name);
        }

        if (!userProfile.profilePicture && userProfile.pictures[0]?.url) {
            userProfile.profilePicture = userProfile.pictures[0].url;
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
        const pictureRef = this.runInFirebaseContext(() =>
            ref(this.storage, filePath)
        );

        return this.runInFirebaseContext(() => getDownloadURL(pictureRef));
    }

    async deleteFilesFromStorage(path: string, fileName: string) {
        const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
        const filePath = `${normalizedPath}/${fileName}`;
        const storageRef = this.runInFirebaseContext(() =>
            ref(this.storage, filePath)
        );

        return this.runInFirebaseContext(() => deleteObject(storageRef));
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
