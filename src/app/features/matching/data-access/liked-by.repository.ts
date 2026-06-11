import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { UserClass } from '../../../shared/models/user.model';
import { AuthStore } from '../../auth/store/auth.store';

type LikedByProfilesResponse = {
  profiles: UserClass[];
};

@Injectable({
  providedIn: 'root',
})
export class LikedByRepository {
  private http = inject(HttpClient);
  private authStore = inject(AuthStore);

  async getProfilesWhoLikedUser(uid: string, resultLimit = 12) {
    const idToken = await this.getIdToken();

    if (!uid || !idToken) {
      return [];
    }

    const response = await firstValueFrom(
      this.http.post<LikedByProfilesResponse>(
        `${environment.API_URL}likedByProfiles`,
        {
          uid,
          limit: resultLimit,
        },
        {
          headers: new HttpHeaders().set('Authorization', idToken),
        }
      )
    );

    return response.profiles ?? [];
  }

  private async getIdToken() {
    const user = this.authStore.user();
    const rawUser = user?.raw as
      | { getIdToken?: (forceRefresh?: boolean) => Promise<string> }
      | undefined;

    if (rawUser?.getIdToken) {
      return rawUser.getIdToken();
    }

    return user?.idToken;
  }
}
