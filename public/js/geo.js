// Geo helpers. All endpoints are free, keyless and CORS-enabled, so the app stays fully static.
import tzlookup from '../vendor/tz-lookup.js';

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}

// Photon (komoot) supports search-as-you-type; Nominatim's usage policy does not allow autocomplete.
export async function search(q) {
  const j = await getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`);
  return j.features.map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    return {
      name: p.name || p.street || p.city || 'Unnamed',
      detail: [p.district, p.city, p.state, p.country].filter((x) => x && x !== p.name).join(', '),
      type: p.osm_value || p.type || '',
      lat, lon,
      // Photon extent: [minLon, maxLat, maxLon, minLat]
      bbox: p.extent ? { s: p.extent[3], n: p.extent[1], w: p.extent[0], e: p.extent[2] } : null,
    };
  });
}

export async function reverse(lat, lon) {
  const j = await getJson(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1&zoom=16&accept-language=en`);
  const a = j.address || {};
  return {
    city: a.city || a.town || a.village || a.municipality || a.county || '',
    district: a.suburb || a.city_district || a.quarter || a.neighbourhood || a.borough || '',
    state: a.state || '',
    country: a.country || '',
    countryCode: a.country_code || '',
    display: j.display_name || '',
  };
}

export async function elevation(lat, lon) {
  const j = await getJson(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
  return j.elevation?.[0] ?? null;
}

// Time zone of a point and its UTC offset on a given local date (handles DST).
export function timezone(lat, lon, localIso) {
  const zone = tzlookup(lat, lon);
  // Treat the wall-clock time as UTC first, then correct by the zone's offset at that instant.
  const guess = new Date(`${localIso}Z`);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' });
  const name = fmt.formatToParts(guess).find((x) => x.type === 'timeZoneName')?.value || 'GMT';
  const m = name.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return { zone, offset: m ? `${m[1]}:${m[2] || '00'}` : '+00:00' };
}
