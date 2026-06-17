export type ServerMatchParts = {
  matches: string[];
  liked: string[];
  notLiked: string[];
  superLiked: string[];
};

export type ServerMatchAction = 'like' | 'pass' | 'superLike' | 'rewind' | 'remove';

export type ServerMatchActionResult = {
  matched: boolean;
  created: boolean;
  matchParts: ServerMatchParts;
};

export const normalizeUidList = (values: unknown): string[] =>
  Array.isArray(values)
    ? values.filter((value): value is string => typeof value === 'string')
    : [];

export const withoutUid = (values: unknown, uid: string): string[] =>
  normalizeUidList(values).filter((value) => value !== uid);

export const withUniqueUid = (values: unknown, uid: string): string[] => {
  const nextValues = normalizeUidList(values);

  if (!nextValues.includes(uid)) {
    nextValues.push(uid);
  }

  return nextValues;
};

export const normalizeMatchParts = (value: unknown): ServerMatchParts => {
  const matchParts =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  return {
    matches: normalizeUidList(matchParts.matches),
    liked: normalizeUidList(matchParts.liked),
    notLiked: normalizeUidList(matchParts.notLiked),
    superLiked: normalizeUidList(matchParts.superLiked),
  };
};

export const buildLikeMatchParts = (
  matchParts: ServerMatchParts,
  otherUid: string,
  isSuperLike = false
): ServerMatchParts => ({
  ...matchParts,
  liked: withUniqueUid(matchParts.liked, otherUid),
  notLiked: withoutUid(matchParts.notLiked, otherUid),
  superLiked: isSuperLike
    ? withUniqueUid(matchParts.superLiked, otherUid)
    : matchParts.superLiked,
});

export const buildPassMatchParts = (
  matchParts: ServerMatchParts,
  otherUid: string
): ServerMatchParts => ({
  ...matchParts,
  liked: withoutUid(matchParts.liked, otherUid),
  notLiked: withUniqueUid(matchParts.notLiked, otherUid),
  superLiked: withoutUid(matchParts.superLiked, otherUid),
});

export const buildRewindMatchParts = (
  matchParts: ServerMatchParts,
  otherUid: string
): ServerMatchParts => ({
  ...matchParts,
  notLiked: withoutUid(matchParts.notLiked, otherUid),
});

export const buildRemoveMatchParts = (
  matchParts: ServerMatchParts,
  otherUid: string
): ServerMatchParts => ({
  ...matchParts,
  matches: withoutUid(matchParts.matches, otherUid),
  liked: withoutUid(matchParts.liked, otherUid),
  superLiked: withoutUid(matchParts.superLiked, otherUid),
  notLiked: withUniqueUid(matchParts.notLiked, otherUid),
});
