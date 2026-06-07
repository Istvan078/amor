import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
    Storage,
    getDownloadURL,
    ref,
    uploadBytes,
} from '@angular/fire/storage';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';

export type ProfileVerificationStatus =
    | 'none'
    | 'pending'
    | 'approved'
    | 'rejected';

export type ProfileVerificationRequestResponse = {
    message: string;
    status: ProfileVerificationStatus;
};

@Injectable({
    providedIn: 'root',
})
export class ProfileVerificationRepository {
    private injector = inject(Injector);
    private storage = inject(Storage);
    private auth = inject(Auth);
    private http = inject(HttpClient);

    async requestProfileVerification(uid: string, selfieFile: File) {
        const idToken = await this.auth.currentUser?.getIdToken();

        if (!uid || !idToken) {
            throw new Error('profile.verification.errors.authRequired');
        }

        const safeFileName = this.getSafeFileName(selfieFile.name);
        const selfiePhotoPath = `verificationSelfies/${uid}/${Date.now()}-${safeFileName}`;
        const storageRef = this.runInFirebaseContext(() =>
            ref(this.storage, selfiePhotoPath)
        );

        await this.runInFirebaseContext(() => uploadBytes(storageRef, selfieFile));

        const selfiePhotoUrl = await this.runInFirebaseContext(() =>
            getDownloadURL(storageRef)
        );

        return firstValueFrom(
            this.http.post<ProfileVerificationRequestResponse>(
                `${environment.API_URL}requestProfileVerification`,
                {
                    uid,
                    selfiePhotoPath,
                    selfiePhotoUrl,
                },
                {
                    headers: new HttpHeaders().set('Authorization', idToken),
                }
            )
        );
    }

    private getSafeFileName(fileName: string) {
        const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
        const baseName =
            fileName
                .replace(/\.[^.]+$/, '')
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9_-]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 64) || 'selfie';

        return `${baseName}.${extension}`;
    }

    private runInFirebaseContext<T>(callback: () => T): T {
        return runInInjectionContext(this.injector, callback);
    }
}
