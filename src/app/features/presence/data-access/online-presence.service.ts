import { Injectable, inject } from '@angular/core';

import { DiscoverRepository } from '../../discover/data-access/discover.repository';

@Injectable({
  providedIn: 'root',
})
export class OnlinePresenceService {
  private discoverRepository = inject(DiscoverRepository);
  private activeUid: string | null = null;

  async setOnline(uid?: string | null) {
    if (!uid || this.activeUid === uid) {
      return;
    }

    await this.updatePresence(uid, true);
    this.activeUid = uid;
  }

  async setOffline(uid?: string | null) {
    const presenceUid = uid ?? this.activeUid;

    if (!presenceUid) {
      return;
    }

    await this.updatePresence(presenceUid, false);

    if (this.activeUid === presenceUid) {
      this.activeUid = null;
    }
  }

  private async updatePresence(uid: string, isOnline: boolean) {
    try {
      await this.discoverRepository.updateUserOnlineStatus(uid, isOnline);
    } catch (error) {
      console.warn('Online presence update failed.', error);
    }
  }
}
