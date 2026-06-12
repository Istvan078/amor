import { Injectable, inject } from '@angular/core';

import { PublicProfile } from '../../../shared/models/public-profile.model';
import { DiscoverRepository } from '../data-access/discover.repository';
import { DiscoverStore } from '../store/discover.store';
import { LikedByRepository } from '../../matching/data-access/liked-by.repository';

@Injectable({
  providedIn: 'root',
})
export class DiscoverFacade {
  readonly store = inject(DiscoverStore);

  private discoverRepository = inject(DiscoverRepository);
  private likedByRepository = inject(LikedByRepository);

  loadDiscoverData() {
    return this.store.loadDiscoverData();
  }

  clearDiscoverData() {
    this.store.clearDiscoverData();
  }

  addMatch(matchProfile: PublicProfile) {
    this.store.addMatch(matchProfile);
  }

  removeMatch(matchUid: string) {
    this.store.removeMatch(matchUid);
  }

  loadMoreCandidates() {
    return this.store.loadMoreCandidates();
  }

  getPossibleMatchProfile(uid: string) {
    return this.discoverRepository.getPossibleMatchProfile(uid);
  }

  getMatchProfiles(matchUids: string[]) {
    return this.discoverRepository.getMatchProfiles(matchUids);
  }

  getUserProfile(uid: string) {
    return this.discoverRepository.getUserProfile(uid);
  }

  async getProfilesWhoLikedUser(uid: string) {
    try {
      return await this.likedByRepository.getProfilesWhoLikedUser(uid);
    } catch (error) {
      console.warn('Failed to load profiles who liked the user.', error);
      return [];
    }
  }
}
