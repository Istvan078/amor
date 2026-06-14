export const toTimestampMillis = (value: unknown) => {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const timestamp = Date.parse(value);

    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  if (typeof value === 'object') {
    const maybeTimestamp = value as {
      toMillis?: () => number;
      toDate?: () => Date;
    };

    if (typeof maybeTimestamp.toMillis === 'function') {
      return maybeTimestamp.toMillis();
    }

    if (typeof maybeTimestamp.toDate === 'function') {
      return maybeTimestamp.toDate().getTime();
    }
  }

  return 0;
};
