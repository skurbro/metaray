# METARAY

A browser-based editor for photo and video metadata. Pick the shooting location on an interactive 3D map, choose the phone model, set the date and camera settings, and write it all back into your files.

**Everything runs locally in your browser.** Files are never uploaded: ExifTool itself runs inside the page as WebAssembly.

## Features

**Media**
- Drag and drop JPG, HEIC, PNG, DNG, TIFF, WebP, MOV, MP4
- Batch editing: select several files and write the same set of tags to all of them
- Reads the existing metadata and shows where each file was originally shot (orange dots on the map)

**Location**
- Dark 3D map with extruded buildings and a street heatmap around the selected point
- Click anywhere, drag the marker, or type coordinates
- Search any city, district or address
- Quick picks: city → district for popular places
- "Random point in district" and "scatter per file" so batch files don't share identical coordinates
- Time zone, UTC offset (DST-aware) and altitude are filled in automatically for the chosen point

**Device**
- iPhone XR → iPhone 17 Pro Max, Samsung Galaxy, Google Pixel, Xiaomi, OnePlus, Huawei, Sony, Nothing
- Per-camera lens data (main / ultra wide / telephoto / front) in the same format phones write
- iOS version or firmware string
- Exposure generator: shutter speed and ISO that fit the time of day

**Date**
- Timeline for picking the day, plus exact time with seconds

**Export**
- "Before → after" preview of the key fields
- Optional wipe of all existing metadata (orientation and color profile are kept)
- Optional place names in XMP/IPTC (city, state, country, district)
- Renames files the way the chosen phone's camera app does, and spaces out capture times across a batch
- Download each file, or all of them as a .zip

### File naming

| Device | Photo | Video |
|---|---|---|
| iPhone | `IMG_4821.HEIC` | `IMG_4822.MOV` |
| Samsung | `20261012_143522.jpg` | `20261012_143540.mp4` |
| Google Pixel (UTC time + ms) | `PXL_20261012_113522417.jpg` | `PXL_20261012_113540088.mp4` |
| Xiaomi, Huawei, other Android | `IMG_20261012_143522.jpg` | `VID_20261012_143540.mp4` |
| OnePlus, Nothing | `IMG20261012143522.jpg` | `VID20261012143540.mp4` |
| Sony Xperia | `DSC_0123.JPG` | `MOV_0124.mp4` |

Only the name changes; the file format is never converted, so the original extension is kept.

### Tags written

| | Images (EXIF / XMP) | Video from iPhone (QuickTime Keys) | Video from Android |
|---|---|---|---|
| Device | Make, Model, Software, HostComputer, LensMake, LensModel | Keys:Make, Model, Software | Keys:AndroidMake, AndroidModel, AndroidVersion |
| Camera | FNumber, FocalLength, FocalLengthIn35mmFormat, ExposureTime, ISO | — | — |
| Date | DateTimeOriginal, CreateDate, ModifyDate, OffsetTime*, SubSecTime* | Keys:CreationDate, QuickTime/Track/Media dates (UTC) | QuickTime/Track/Media dates (UTC) |
| Location | GPSLatitude/Longitude/Altitude + refs, GPS date/time stamp, positioning error, image direction | Keys:GPSCoordinates, LocationAccuracyHorizontal | UserData:GPSCoordinates |

## Tech stack

- Plain HTML, CSS and JavaScript (ES modules), no build step
- [MapLibre GL JS](https://maplibre.org/) with [OpenFreeMap](https://openfreemap.org/) vector tiles
- [ExifTool](https://exiftool.org/) compiled to WebAssembly via [@uswriting/exiftool](https://www.npmjs.com/package/@uswriting/exiftool) / zeroperl
- [Photon](https://photon.komoot.io/) for search, [Nominatim](https://nominatim.org/) for reverse geocoding
- [Open-Meteo Elevation API](https://open-meteo.com/en/docs/elevation-api) for altitude
- [@photostructure/tz-lookup](https://github.com/photostructure/tz-lookup) for time zones (vendored)
- [fflate](https://github.com/101arrowz/fflate) for zip export

## Run locally

Any static file server works. With Node.js installed:

```bash
npm start
```

Then open http://localhost:4317.

Opening `index.html` directly from disk will not work: ES modules need to be served over HTTP.

An internet connection is needed for map tiles, search, altitude and the ExifTool engine. The engine (~25 MB) is downloaded on first use and cached by the browser.

## Deploy

The site is the `public/` folder, so it can be hosted for free as static files.

### GitHub Pages

1. Push the repository to GitHub.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` runs `.github/workflows/pages.yml` and publishes the site at `https://<user>.github.io/<repo>/`.

### Cloudflare Pages

1. In the Cloudflare dashboard open **Workers & Pages → Create → Pages → Connect to Git** and pick the repository.
2. Framework preset: **None**. Build command: leave empty. Build output directory: `public`.
3. Deploy. The site is published at `https://<project>.pages.dev`.

## Project structure

```
public/
  index.html          page layout and import map
  css/styles.css      styles
  js/app.js           UI and map logic
  js/tags.js          builds the ExifTool tag set (pure, no DOM)
  js/names.js         device-style file names
  js/exif.js          ExifTool WebAssembly wrapper
  js/geo.js           search, reverse geocoding, elevation, time zones
  js/devices.js       phone catalog
  js/places.js        city → district quick picks
  vendor/tz-lookup.js time zone lookup (CC0)
```

## Notes

- Lens values for the iPhone 17 series and most Android phones are approximations. Edit `public/js/devices.js` to match a real file from your device.
- Search and reverse geocoding use free community services with fair-use limits; please don't automate bulk requests.
- macOS adds a "Where from" note (`com.apple.metadata:kMDItemWhereFroms`) to every file a browser downloads. It is a Finder attribute, not part of the file's metadata, and is not sent along when the file is uploaded. Clear it with `xattr -d com.apple.metadata:kMDItemWhereFroms <file>`; the app shows a ready-to-copy command after downloading.
- The hosted version uses [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) to count page views: no cookies, no personal data, and nothing about the files you edit. Remove the `cloudflareinsights` script from `public/index.html` if you self-host and don't want it.
- Map data © OpenStreetMap contributors.
