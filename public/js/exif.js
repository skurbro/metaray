// Thin wrapper around ExifTool compiled to WebAssembly (zeroperl).
// Everything runs inside the browser tab: files are never uploaded anywhere.
import { parseMetadata, writeMetadata } from '@uswriting/exiftool';

// zeroperl fetches "./zeroperl.wasm" relative to the page by default; point it at the CDN copy instead.
// ~25 MB, downloaded once and then served from the browser cache.
export const WASM_URL = 'https://cdn.jsdelivr.net/npm/@6over3/zeroperl-ts@1.0.10/dist/esm/zeroperl.wasm';

let engineState = 'idle';
const listeners = new Set();
export const onEngine = (fn) => { listeners.add(fn); fn(engineState); };
const setEngine = (s) => { engineState = s; listeners.forEach((fn) => fn(s)); };

const wasmFetch = async () => {
  if (engineState !== 'ready') setEngine('loading');
  return fetch(WASM_URL);
};

// The wasm build shares one Perl interpreter, so calls must not overlap.
let chain = Promise.resolve();
const serial = (job) => {
  const run = chain.then(job, job);
  chain = run.catch(() => {});
  return run;
};

// -q -q silences warnings: the wrapper treats any stderr output as a failure.
const COMMON = ['-api', 'QuickTimeUTC=1', '-api', 'LargeFileSupport=1', '-m', '-q', '-q'];
const BINARY = /^\(Binary data/;

export function readMeta(file) {
  return serial(async () => {
    const r = await parseMetadata(file, {
      args: ['-json', '-G1', '-a', '-n', '-api', 'LargeFileSupport=1'],
      transform: (s) => JSON.parse(s)[0],
      fetch: wasmFetch,
    });
    setEngine('ready');
    if (!r.success) throw new Error(r.error || 'ExifTool could not read the file');
    const meta = r.data || {};
    delete meta.SourceFile;
    for (const k of Object.keys(meta)) {
      if (/^(ExifTool|System|File):/.test(k) || (typeof meta[k] === 'string' && BINARY.test(meta[k]))) delete meta[k];
    }
    return meta;
  });
}

// Returns a new File with the tags applied. The original File object is left untouched.
export function writeFile(file, tags, { stripAll = false } = {}) {
  return serial(async () => {
    let src = file;
    if (stripAll) {
      // Separate pass so the wipe can never clobber the new values.
      // Orientation and the color profile are kept, otherwise the image renders rotated or washed out.
      const r = await writeMetadata(src, {}, {
        args: ['-all=', '-tagsFromFile', '@', '-Orientation', '-ICC_Profile', '-ColorSpace', ...COMMON],
        fetch: wasmFetch,
      });
      if (!r.success) throw new Error(r.error);
      src = new File([r.data], file.name, { type: file.type });
    }
    const r = await writeMetadata(src, tags, { args: COMMON, fetch: wasmFetch });
    setEngine('ready');
    if (!r.success) throw new Error(r.error);
    return new File([r.data], file.name, { type: file.type, lastModified: Date.now() });
  });
}
