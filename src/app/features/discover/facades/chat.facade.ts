import { Injectable, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { PublicProfile } from '../../../shared/models/public-profile.model';
import { DiscoverUiStore } from '../store/discover-ui.store';

type DiscoverDeepLinkHandlers = {
  messageMatchUid: (matchUid: string) => void;
  targetProfileUid: (targetUid: string) => void;
};

@Injectable({
  providedIn: 'root',
})
export class ChatFacade {
  readonly uiStore = inject(DiscoverUiStore);

  private route = inject(ActivatedRoute);
  private router = inject(Router);

  listenForDeepLinks(handlers: DiscoverDeepLinkHandlers) {
    return this.route.queryParamMap.subscribe((params) => {
      const view = params.get('view');
      const matchUid = params.get('matchUid');
      const targetUid = params.get('targetUid');

      if (view === 'messages' && matchUid) {
        handlers.messageMatchUid(matchUid);
        return;
      }

      if (targetUid) {
        handlers.targetProfileUid(targetUid);
      }
    });
  }

  clearDiscoverDeepLink() {
    return this.router.navigate(['/amor/discover'], { replaceUrl: true });
  }

  setPhoneView(phoneView: boolean) {
    this.uiStore.setPhoneView(phoneView);
  }

  openUserCard() {
    this.uiStore.openUserCard();
  }

  showMatchesCard() {
    this.uiStore.showMatchesCard();
  }

  showMessages(selectedMessageProfile?: PublicProfile | null) {
    this.uiStore.showMessages(selectedMessageProfile ?? null);
  }
}
