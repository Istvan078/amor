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
    private readonly processedPictureTimeoutMs = 60_000;
    private readonly processedPicturePollMs = 1_000;

    async addPictures(uid: string, userProfile: UserClass, files: File[]) {
        if (!files.length) {
            return userProfile;
        }

        if (!userProfile.pictures?.length) {
            userProfile.pictures = [];
        }

        for (const file of files) {
            if (userProfile.pictures.length >= this.maxPictures) {
                continue;
            }

            const storageFileName = this.createStorageFileName(file);
            const privatePicturePath = `pictures/${uid}/${storageFileName}`;
            const storageRef = this.runInFirebaseContext(() =>
                ref(this.storage, privatePicturePath)
            );

            await this.runInFirebaseContext(() => uploadBytes(storageRef, file));

            const publicPicturePath = `publicPictures/${uid}/${storageFileName}`;
            const thumbnailPath = `publicPictures/${uid}/thumbs/${this.getThumbnailFileName(storageFileName)}`;
            const [url, thumbnailUrl] = await Promise.all([
                this.waitForProcessedDownloadUrl(publicPicturePath, true),
                this.waitForProcessedDownloadUrl(thumbnailPath, false),
            ]);

            if (!url) {
                throw new Error('profile.pictures.errors.processingTimeout');
            }

            userProfile.pictures.push({
                url,
                name: storageFileName,
                ...(thumbnailUrl ? { thumbnailUrl } : {}),
            });
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
        const filePath = `publicPictures/${uid}/${fileName}`;
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
        const deleteResults = await Promise.allSettled([
            this.runInFirebaseContext(() => deleteObject(storageRef)),
            ...this.getMirroredDeletePaths(normalizedPath, fileName).map(
                (mirroredPath) =>
                    this.runInFirebaseContext(() =>
                        deleteObject(ref(this.storage, mirroredPath))
                    )
            ),
        ]);
        const originalDelete = deleteResults[0];

        if (originalDelete.status === 'rejected') {
            throw originalDelete.reason;
        }
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }

    private async waitForProcessedDownloadUrl(path: string, required: boolean) {
        const deadline =
            Date.now() + (required ? this.processedPictureTimeoutMs : 10_000);
        let lastError: unknown;

        while (Date.now() < deadline) {
            try {
                const storageRef = this.runInFirebaseContext(() =>
                    ref(this.storage, path)
                );

                return await this.runInFirebaseContext(() =>
                    getDownloadURL(storageRef)
                );
            } catch (error) {
                lastError = error;
                await this.delay(this.processedPicturePollMs);
            }
        }

        if (required) {
            throw lastError ?? new Error('profile.pictures.errors.processingTimeout');
        }

        return undefined;
    }

    private delay(ms: number) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    private getMirroredDeletePaths(normalizedPath: string, fileName: string) {
        if (!normalizedPath.startsWith('publicPictures/')) {
            return [];
        }

        const [, uid] = normalizedPath.split('/');

        if (!uid) {
            return [];
        }

        return [
            `pictures/${uid}/${fileName}`,
            `publicPictures/${uid}/thumbs/${this.getThumbnailFileName(fileName)}`,
        ];
    }

    private createStorageFileName(file: File) {
        const extension = this.getFileExtension(file);

        return `${crypto.randomUUID()}.${extension}`;
    }

    private getFileExtension(file: File) {
        const fileNameExtension = file.name.includes('.')
            ? file.name.split('.').pop()
            : '';
        const mimeExtension = file.type.startsWith('image/')
            ? file.type.slice('image/'.length)
            : '';
        const extension = String(fileNameExtension || mimeExtension || 'jpg')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');

        if (!extension || extension.length > 8) {
            return 'jpg';
        }

        return extension === 'jpeg' ? 'jpg' : extension;
    }

    private getThumbnailFileName(fileName: string) {
        const baseName = fileName.replace(/\.[^.]+$/, '') || crypto.randomUUID();

        return `${baseName}.webp`;
    }
}
