import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { UserClass } from '../../../shared/models/user.model';
import { AuthStore } from '../../auth/store/auth.store';

export type MatchActionResponse = {
  matched: boolean;
  created: boolean;
  matchParts?: UserClass['matchParts'];
};

type MatchActionEndpoint =
  | 'likeUser'
  | 'passUser'
  | 'superLikeUser'
  | 'rewind';

@Injectable({
  providedIn: 'root',
})
export class MatchActionsRepository {
  private http = inject(HttpClient);
  private authStore = inject(AuthStore);

  likeUser(otherUid: string) {
    return this.postMatchAction('likeUser', otherUid);
  }

  passUser(otherUid: string) {
    return this.postMatchAction('passUser', otherUid);
  }

  superLikeUser(otherUid: string) {
    return this.postMatchAction('superLikeUser', otherUid);
  }

  rewind(otherUid: string) {
    return this.postMatchAction('rewind', otherUid);
  }

  private async postMatchAction(
    endpoint: MatchActionEndpoint,
    otherUid: string
  ): Promise<MatchActionResponse> {
    const user = this.authStore.user();
    const idToken = await this.getIdToken();

    if (!user?.uid || !idToken) {
      throw new Error('matching.errors.authRequired');
    }

    return firstValueFrom(
      this.http.post<MatchActionResponse>(
        `${environment.API_URL}${endpoint}`,
        {
          uid: user.uid,
          otherUid,
        },
        {
          headers: new HttpHeaders().set('Authorization', idToken),
        }
      )
    );
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
