const EARTH_RADIUS_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km between two { lat, lng } points. */
export function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export const toPoint = ({ lat, lng }) => ({ type: 'Point', coordinates: [lng, lat] });
export const fromPoint = (p) => ({ lat: p.coordinates[1], lng: p.coordinates[0] });
