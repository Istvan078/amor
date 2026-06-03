import { Injectable, inject } from '@angular/core';

import { DiscoverRepository } from '../../discover/data-access/discover.repository';

@Injectable({
  providedIn: 'root',
})
export class OnlinePresenceService {
  private discoverRepository = inject(DiscoverRepository);
  private activeUid: string | null = null;
  private heartbeatId: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatMs = 45_000;

  async setOnline(uid?: string | null) {
    if (!uid) {
      return;
    }

    if (this.activeUid !== uid) {
      this.stopHeartbeat();
      this.activeUid = uid;
      this.startHeartbeat(uid);
    }

    await this.updatePresence(uid, true);
  }

  async setOffline(uid?: string | null) {
    const presenceUid = uid ?? this.activeUid;

    if (!presenceUid) {
      return;
    }

    await this.updatePresence(presenceUid, false);

    if (this.activeUid === presenceUid) {
      this.stopHeartbeat();
      this.activeUid = null;
    }
  }

  private startHeartbeat(uid: string) {
    this.heartbeatId = setInterval(() => {
      if (this.activeUid === uid) {
        void this.updatePresence(uid, true);
      }
    }, this.heartbeatMs);
  }

  private stopHeartbeat() {
    if (!this.heartbeatId) {
      return;
    }

    clearInterval(this.heartbeatId);
    this.heartbeatId = null;
  }

  private async updatePresence(uid: string, isOnline: boolean) {
    try {
      await this.discoverRepository.updateUserOnlineStatus(uid, isOnline);
    } catch (error) {
      console.warn('Online presence update failed.', error);
    }
  }
}
