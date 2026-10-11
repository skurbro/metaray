// Builds the ExifTool tag map for one file from the editor state.
// Pure module: no DOM access, so it can be unit-tested in Node.

const pad = (n) => String(n).padStart(2, '0');
const isApple = (make) => /^apple$/i.test(make || '');

export const VIDEO_EXT = new Set(['mov', 'mp4', 'm4v', '3gp']);
export const IMAGE_EXT = new Set(['jpg', 'jpeg', 'heic', 'heif', 'png', 'tif', 'tiff', 'dng', 'webp', 'avif']);

export function kindOf(name) {
  const ext = name.split('.').pop().toLowerCase();
  return VIDEO_EXT.has(ext) ? 'video' : IMAGE_EXT.has(ext) ? 'image' : 'other';
}

// "YYYY:MM:DD HH:MM:SS" + "+03:00" -> Date in UTC
export function toUtc(local, offset) {
  const m = local?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  const o = offset?.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m || !o) return null;
  const sign = o[1] === '-' ? -1 : 1;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - sign * (+o[2] * 60 + +o[3]) * 60000;
  return new Date(ms);
}

// Random point within `meters` of (lat, lon), uniformly distributed over the disc.
export function jitterPoint(lat, lon, meters) {
  const r = meters * Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  return [lat + (r * Math.cos(a)) / 111320, lon + (r * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180))];
}

/**
 * @param {'image'|'video'} kind
 * @param {object} p      payload collected from the UI
 * @param {object} existing  current tags of the file (-G1 keys), used to keep XMP dates in sync
 */
export function buildTags(kind, p, existing = {}) {
  const t = {};
  const has = (re) => Object.keys(existing).some((k) => re.test(k));
  const set = (k, v) => { if (v !== undefined && v !== null && v !== '') t[k] = v; };
  const apple = isApple(p.make);
  const hasDate = !!(p.date && p.offset);
  const utc = hasDate ? toUtc(p.date, p.offset) : null;
  const hasGps = Number.isFinite(p.lat) && Number.isFinite(p.lon);

  if (kind === 'video') {
    if (apple) {
      // Same keys an iPhone writes into a .mov (com.apple.quicktime.*)
      set('Keys:Make', p.make);
      set('Keys:Model', p.model);
      set('Keys:Software', p.software);
      if (hasDate) set('Keys:CreationDate', `${p.date}${p.offset}`);
      if (hasGps) {
        set('Keys:GPSCoordinates', `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}, ${(p.alt ?? 0).toFixed(3)}`);
        set('Keys:LocationAccuracyHorizontal', String(p.accuracy ?? 14.1));
        if (p.writePlace && p.placeLabel) set('Keys:LocationName', p.placeLabel);
      }
    } else {
      // Android camera apps use com.android.* keys and the ©xyz user-data atom
      set('Keys:AndroidMake', p.make);
      set('Keys:AndroidModel', p.model);
      set('Keys:AndroidVersion', p.androidVersion);
      if (hasGps) set('UserData:GPSCoordinates', `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`);
    }
    if (hasDate) {
      // QuickTime dates are stored in UTC; with -api QuickTimeUTC ExifTool converts from the given offset.
      const d = `${p.date}${p.offset}`;
      for (const k of ['QuickTime:CreateDate', 'QuickTime:ModifyDate', 'TrackCreateDate', 'TrackModifyDate', 'MediaCreateDate', 'MediaModifyDate']) t[k] = d;
    }
    return t;
  }

  // --- images ---
  set('Make', p.make);
  set('Model', p.model);
  set('Software', p.software);
  if (apple) set('HostComputer', p.model);
  set('LensMake', p.lensMake);
  set('LensModel', p.lensModel);
  set('FNumber', p.fNumber);
  set('ApertureValue', p.fNumber);
  set('FocalLength', p.focalLength);
  set('FocalLengthIn35mmFormat', p.focal35);
  set('ExposureTime', p.exposureTime);
  set('ISO', p.iso);

  if (hasDate) {
    t.DateTimeOriginal = t.CreateDate = t.ModifyDate = p.date;
    t.OffsetTime = t.OffsetTimeOriginal = t.OffsetTimeDigitized = p.offset;
    const sub = String(p.subsec ?? Math.floor(Math.random() * 1000)).padStart(3, '0');
    t.SubSecTimeOriginal = t.SubSecTimeDigitized = sub;
    // Only touch XMP dates that already exist, so we don't add an XMP block a phone wouldn't write.
    for (const k of ['XMP-xmp:CreateDate', 'XMP-xmp:ModifyDate', 'XMP-photoshop:DateCreated']) {
      if (has(new RegExp(`^${k}$`))) t[k] = `${p.date}${p.offset}`;
    }
  }

  if (hasGps) {
    t.GPSLatitude = Math.abs(p.lat);
    t.GPSLatitudeRef = p.lat >= 0 ? 'N' : 'S';
    t.GPSLongitude = Math.abs(p.lon);
    t.GPSLongitudeRef = p.lon >= 0 ? 'E' : 'W';
    if (p.alt != null) {
      t.GPSAltitude = Math.abs(p.alt);
      // ExifTool reads a signed number here: negative means below sea level.
      t.GPSAltitudeRef = p.alt >= 0 ? 1 : -1;
    }
    if (utc) {
      t.GPSDateStamp = `${utc.getUTCFullYear()}:${pad(utc.getUTCMonth() + 1)}:${pad(utc.getUTCDate())}`;
      t.GPSTimeStamp = `${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}:${pad(utc.getUTCSeconds())}`;
    }
    set('GPSHPositioningError', p.accuracy);
    if (p.direction != null) {
      t.GPSImgDirection = t.GPSDestBearing = p.direction;
      t.GPSImgDirectionRef = t.GPSDestBearingRef = 'T';
    }
    if (apple) {
      t.GPSSpeed = 0;
      t.GPSSpeedRef = 'K';
    }
  }

  if (p.writePlace && p.place) {
    set('XMP-photoshop:City', p.place.city);
    set('XMP-photoshop:State', p.place.state);
    set('XMP-photoshop:Country', p.place.country);
    set('XMP-iptcCore:Location', p.place.district);
    set('XMP-iptcCore:CountryCode', p.place.countryCode?.toUpperCase());
  }
  set('Artist', p.artist);
  set('Copyright', p.copyright);
  set('ImageDescription', p.description);
  return t;
}

// Pull the handful of fields the UI shows out of a -G1 -n tag dump.
export function summarize(meta) {
  const keys = Object.keys(meta);
  const pick = (...names) => {
    for (const n of names) {
      const hit = keys.find((k) => k === n || k.endsWith(':' + n));
      if (hit !== undefined && meta[hit] !== '' && meta[hit] != null) return meta[hit];
    }
    return null;
  };
  // Composite:* values are signed (N/S, E/W applied); GPS:GPSLatitude is not.
  let lat = pick('Composite:GPSLatitude', 'GPSLatitude');
  let lon = pick('Composite:GPSLongitude', 'GPSLongitude');
  const coords = pick('GPSCoordinates');
  if ((lat == null || lon == null) && typeof coords === 'string') [lat, lon] = coords.split(/[\s,]+/).map(Number);
  return {
    make: pick('Make', 'AndroidMake'),
    model: pick('Model', 'AndroidModel'),
    software: pick('Software', 'AndroidVersion'),
    lens: pick('LensModel'),
    date: pick('DateTimeOriginal', 'CreationDate', 'CreateDate'),
    lat: lat != null ? Number(lat) : null,
    lon: lon != null ? Number(lon) : null,
    alt: pick('Composite:GPSAltitude', 'GPSAltitude'),
  };
}
