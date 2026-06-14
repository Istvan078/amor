const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const GEOHASH_PRECISION = 8;
const GEOHASH_BUCKET_PRECISION = 4;
const MAX_DISCOVERY_GEO_BUCKETS = 25;

type Coords = {
  lat: number;
  lon: number;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const getCoords = (coords: unknown): Coords | undefined => {
  const location =
    coords && typeof coords === 'object'
      ? (coords as Record<string, unknown>)
      : {};
  const lat = Number(location.lat);
  const lon = Number(location.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return undefined;
  }

  return {
    lat: Math.max(Math.min(lat, 90), -90),
    lon: Math.max(Math.min(lon, 180), -180),
  };
};

const encodeGeoHash = (coords: unknown, precision = GEOHASH_PRECISION) => {
  const location = getCoords(coords);

  if (!location) {
    return undefined;
  }

  let latRange: [number, number] = [-90, 90];
  let lonRange: [number, number] = [-180, 180];
  let isEven = true;
  let bit = 0;
  let hashValue = 0;
  let hash = '';

  while (hash.length < precision) {
    const range = isEven ? lonRange : latRange;
    const midpoint = (range[0] + range[1]) / 2;
    const value = isEven ? location.lon : location.lat;

    if (value >= midpoint) {
      hashValue = (hashValue << 1) + 1;
      range[0] = midpoint;
    } else {
      hashValue <<= 1;
      range[1] = midpoint;
    }

    isEven = !isEven;

    if (bit < 4) {
      bit++;
    } else {
      hash += GEOHASH_BASE32[hashValue];
      bit = 0;
      hashValue = 0;
    }
  }

  return hash;
};

export const createApproximateGeoHash = (coords: unknown) => encodeGeoHash(coords);

export const createGeoBucket = (coords: unknown) =>
  encodeGeoHash(coords, GEOHASH_BUCKET_PRECISION);

export const getNearbyGeoBuckets = (coords: unknown, radiusKm: number) => {
  const location = getCoords(coords);

  if (!location) {
    return [];
  }

  const radius = Number.isFinite(radiusKm) ? Math.max(radiusKm, 1) : 50;
  const span = radius > 90 ? 2 : 1;
  const latDelta = Math.max(radius / 111, 0.08);
  const lonDelta = Math.max(
    radius / (111 * Math.max(Math.cos(toRadians(location.lat)), 0.2)),
    0.08
  );
  const buckets = new Set<string>();

  for (let latOffset = -span; latOffset <= span; latOffset++) {
    for (let lonOffset = -span; lonOffset <= span; lonOffset++) {
      const bucket = createGeoBucket({
        lat: location.lat + latOffset * latDelta,
        lon: location.lon + lonOffset * lonDelta,
      });

      if (bucket) {
        buckets.add(bucket);
      }
    }
  }

  return [...buckets].slice(0, MAX_DISCOVERY_GEO_BUCKETS);
};
