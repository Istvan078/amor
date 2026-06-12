import { Injectable, inject } from '@angular/core';

import { OnlinePresenceService } from '../../presence/data-access/online-presence.service';

@Injectable({
  providedIn: 'root',
})
export class PresenceFacade {
  private onlinePresenceService = inject(OnlinePresenceService);

  setOnline(uid: string) {
    return this.onlinePresenceService.setOnline(uid);
  }

  setOffline(uid?: string | null) {
    return this.onlinePresenceService.setOffline(uid ?? undefined);
  }
}
