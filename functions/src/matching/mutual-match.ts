import {
  ServerMatchParts,
  withUniqueUid,
  withoutUid,
} from './match-actions';

export const buildMutualMatchParts = (
  matchParts: ServerMatchParts,
  otherUid: string
): ServerMatchParts => ({
  ...matchParts,
  matches: withUniqueUid(matchParts.matches, otherUid),
  liked: withoutUid(matchParts.liked, otherUid),
  notLiked: withoutUid(matchParts.notLiked, otherUid),
  superLiked: withoutUid(matchParts.superLiked, otherUid),
});
