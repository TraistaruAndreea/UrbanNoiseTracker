import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_BOUNDS = {
  // Bounding box (approx) for Bucharest + a bit of buffer.
  // Used only as a sanity check.
  minLat: 44.32,
  maxLat: 44.58,
  minLon: 25.92,
  maxLon: 26.32,
};

// Approximate sector “centroids” (hand-tuned). Good enough as a fallback,
// but for accuracy you can pass a sectors GeoJSON.
const DEFAULT_SECTOR_CENTROIDS = [
  { id: "1", lat: 44.50, lon: 26.08 }, // Nord / Nord-Vest (Băneasa)
  { id: "2", lat: 44.48, lon: 26.16 }, // Nord-Est (Colentina)
  { id: "3", lat: 44.41, lon: 26.18 }, // Est / Sud-Est (Titan)
  { id: "4", lat: 44.35, lon: 26.12 }, // Sud (Berceni)
  { id: "5", lat: 44.39, lon: 26.05 }, // Sud-Vest (Rahova)
  { id: "6", lat: 44.43, lon: 26.00 }, // Vest (Militari)
];

const inBounds = (lat, lon, bounds = DEFAULT_BOUNDS) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lon >= bounds.minLon &&
    lon <= bounds.maxLon
  );
};

// Equirectangular approximation; fine for comparing distances in a city.
const distance2 = (lat, lon, refLat, refLon) => {
  const midLatRad = (((lat + refLat) / 2) * Math.PI) / 180;
  const x = (lon - refLon) * Math.cos(midLatRad);
  const y = lat - refLat;
  return x * x + y * y;
};

const nearestCentroidSector = (lat, lon, centroids = DEFAULT_SECTOR_CENTROIDS) => {
  let best = "";
  let bestD2 = Infinity;
  for (const s of centroids) {
    const d2 = distance2(lat, lon, s.lat, s.lon);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = s.id;
    }
  }
  return best;
};

const pointInRing = (lon, lat, ring) => {
  // Ray casting. ring is array of [lon, lat].
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

const pointInPolygon = (lon, lat, polygon) => {
  // polygon: [outerRing, ...holes]
  if (!polygon || polygon.length === 0) return false;
  const [outer, ...holes] = polygon;
  if (!pointInRing(lon, lat, outer)) return false;
  for (const hole of holes) {
    if (pointInRing(lon, lat, hole)) return false;
  }
  return true;
};

const normalizeGeojsonSectors = (geojson) => {
  if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    throw new Error("Invalid sectors GeoJSON: expected FeatureCollection");
  }

  /** @type {{ id: string, multiPolygons: any[] }[]} */
  const out = [];

  for (const f of geojson.features) {
    const props = f?.properties ?? {};
    const idRaw = props.sector ?? props.SECTOR ?? props.id ?? props.ID;
    const id = idRaw === undefined || idRaw === null ? "" : String(idRaw).trim();
    if (!id || !/^[1-6]$/.test(id)) continue;

    const g = f.geometry;
    if (!g) continue;

    if (g.type === "Polygon") {
      out.push({ id, multiPolygons: [g.coordinates] });
      continue;
    }
    if (g.type === "MultiPolygon") {
      out.push({ id, multiPolygons: g.coordinates });
      continue;
    }
  }

  if (out.length === 0) {
    throw new Error(
      "Sectors GeoJSON loaded, but no features had sector id in properties (expected sector/id in [1..6])."
    );
  }

  return out;
};

const resolveGeojsonPath = (p) => {
  if (!p) return undefined;
  const full = path.isAbsolute(p) ? p : path.join(process.cwd(), p.replaceAll("/", path.sep));
  return full;
};

/**
 * Creates a resolver: (lat, lon) => "1".."6" or "".
 *
 * If you provide a GeoJSON, it will do point-in-polygon.
 * Otherwise it falls back to nearest centroid (approx).
 */
export const createBucharestSectorResolver = async ({ geojsonPath } = {}) => {
  const full = resolveGeojsonPath(geojsonPath);
  let geoSectors = undefined;
  if (full) {
    const raw = await fs.readFile(full, "utf8");
    geoSectors = normalizeGeojsonSectors(JSON.parse(raw));
  }

  return (lat, lon) => {
    if (!inBounds(lat, lon)) return "";

    if (geoSectors) {
      // GeoJSON coords are [lon, lat]
      for (const s of geoSectors) {
        for (const poly of s.multiPolygons) {
          if (pointInPolygon(lon, lat, poly)) return s.id;
        }
      }
      return "";
    }

    return nearestCentroidSector(lat, lon);
  };
};
