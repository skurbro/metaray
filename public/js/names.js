// File names in the style each phone's stock camera app uses.
// Pure module: no DOM access.

const pad = (n, l = 2) => String(n).padStart(l, '0');

// "YYYY:MM:DD HH:MM:SS" -> parts
function parts(local) {
  const m = local.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  return m ? { y: m[1], mo: m[2], d: m[3], h: m[4], mi: m[5], s: m[6] } : null;
}

// Shift "YYYY:MM:DD HH:MM:SS" by a number of seconds (calendar-safe).
export function addSeconds(local, sec) {
  const p = parts(local);
  if (!p) return local;
  const t = new Date(Date.UTC(+p.y, +p.mo - 1, +p.d, +p.h, +p.mi, +p.s) + sec * 1000);
  return `${t.getUTCFullYear()}:${pad(t.getUTCMonth() + 1)}:${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}

// Local wall-clock time -> UTC parts (Pixel names files in UTC).
function utcParts(local, offset) {
  const o = offset?.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!o) return parts(local);
  const shift = (o[1] === '-' ? 1 : -1) * (+o[2] * 3600 + +o[3] * 60);
  return parts(addSeconds(local, shift));
}

export function namingScheme(device) {
  if (!device) return null;
  return {
    Apple: 'apple', Samsung: 'samsung', Google: 'pixel', Xiaomi: 'xiaomi',
    OnePlus: 'oneplus', Huawei: 'huawei', Sony: 'sony', Nothing: 'nothing',
  }[device.brand] || 'aosp';
}

/**
 * @param {object} device   entry from devices.js
 * @param {'image'|'video'} kind
 * @param {string} ext      original extension (format is never converted, only the name changes)
 * @param {string} local    capture time "YYYY:MM:DD HH:MM:SS"
 * @param {string} offset   "+03:00"
 * @param {number} counter  sequential counter for counter-based schemes (iPhone, Sony)
 * @param {number} ms       milliseconds for schemes that include them (Pixel)
 */
export function deviceFileName(device, kind, ext, local, offset, counter, ms = 0) {
  const scheme = namingScheme(device);
  const p = parts(local);
  if (!scheme || !p) return null;
  const e = ext.toLowerCase() === 'jpeg' ? 'jpg' : ext.toLowerCase();
  const stamp = `${p.y}${p.mo}${p.d}_${p.h}${p.mi}${p.s}`;
  const n4 = pad(((counter - 1) % 9999) + 1, 4);
  switch (scheme) {
    case 'apple':
      // IMG_4821.HEIC / IMG_4822.MOV — one counter for photos and videos, upper-case extension
      return `IMG_${n4}.${e.toUpperCase()}`;
    case 'samsung':
      // 20261012_143522.jpg / 20261012_143522.mp4
      return `${stamp}.${e}`;
    case 'pixel': {
      // PXL_20261012_113522417.jpg — UTC time with milliseconds; videos too
      const u = utcParts(local, offset);
      return `PXL_${u.y}${u.mo}${u.d}_${u.h}${u.mi}${u.s}${pad(ms, 3)}.${e}`;
    }
    case 'oneplus':
    case 'nothing':
      // IMG20261012143522.jpg / VID20261012143522.mp4
      return `${kind === 'video' ? 'VID' : 'IMG'}${p.y}${p.mo}${p.d}${p.h}${p.mi}${p.s}.${e}`;
    case 'sony':
      // DSC_0123.JPG / MOV_0124.mp4
      return kind === 'video' ? `MOV_${n4}.${e}` : `DSC_${n4}.${e.toUpperCase()}`;
    default:
      // Xiaomi, Huawei and stock AOSP cameras: IMG_20261012_143522.jpg / VID_20261012_143522.mp4
      return `${kind === 'video' ? 'VID' : 'IMG'}_${stamp}.${e}`;
  }
}

// A plausible starting point for counter-based schemes (a phone that has taken a few thousand shots).
export const randomCounter = () => 1000 + Math.floor(Math.random() * 8000);
