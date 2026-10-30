import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { plainPath, atomicJSON, readJSON } from './install-state.mjs';
export function version(value) {
  const m = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!m) throw Error('Invalid release version');
  return { text: value.replace(/^v/, ''), core: m.slice(1, 4).map(Number), pre: m[4]?.split('.') || [] };
}
export function compareVersions(a, b) {
  const x = version(a),
    y = version(b);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return Math.sign(x.core[i] - y.core[i]);
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i],
      q = y.pre[i];
    if (p === q) continue;
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const n = /^\d+$/.test(p),
      m = /^\d+$/.test(q);
    if (n && m) return Math.sign(Number(p) - Number(q));
    if (n !== m) return n ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}
export function displayVersion(value) {
  const v = version(value);
  return !v.pre.length && v.core[2] === 0 ? v.core.slice(0, 2).join('.') : v.text;
}
export function repository(value) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(value) ||
    value.split('/')[1] === '..'
  )
    throw Error('Invalid GitHub repository');
  return value;
}
export function selectRelease(releases, current, config, { allowCurrent = false } = {}) {
  repository(config.repository);
  version(current);
  if (!Array.isArray(releases)) throw Error('Unexpected GitHub response');
  return (
    releases
      .filter(r => {
        if (r.draft || !r.published_at || (r.prerelease && config.channel !== 'preview')) return false;
        try {
          const compared = compareVersions(r.tag_name, current);
          return (compared > 0 || (allowCurrent && compared === 0)) && !version(r.tag_name).pre.includes('dev');
        } catch {
          return false;
        }
      })
      .sort((a, b) => compareVersions(b.tag_name, a.tag_name))[0] || null
  );
}
export function releaseAsset(release, name, repo, maxBytes) {
  const matches = release.assets?.filter(a => a.name === name) || [];
  if (matches.length !== 1) throw Error(`Release is incomplete: ${name}`);
  const a = matches[0],
    url = new URL(a.browser_download_url);
  const expected = `/${repository(repo)}/releases/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(name)}`;
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== expected
  )
    throw Error('Release asset is outside the configured repository');
  if (
    a.state !== 'uploaded' ||
    !Number.isSafeInteger(a.size) ||
    a.size <= 0 ||
    a.size > maxBytes ||
    !/^sha256:[a-f0-9]{64}$/i.test(a.digest || '')
  )
    throw Error('Release asset has no valid size or SHA-256 digest');
  return { ...a, sha256: a.digest.slice(7).toLowerCase() };
}
export async function fetchBytes(
  url,
  { limit, fetcher = fetch, accept = 'application/octet-stream', fresh = false } = {}
) {
  let current = new URL(url);
  const hosts = new Set([
    'api.github.com',
    'github.com',
    'release-assets.githubusercontent.com',
    'objects.githubusercontent.com'
  ]);
  for (let i = 0; i < 6; i++) {
    if (current.protocol !== 'https:' || !hosts.has(current.hostname) || current.username || current.password)
      throw Error('Unexpected download redirect');
    const response = await fetcher(current.href, {
      headers: {
        Accept: accept,
        'User-Agent': 'TS6-Enhanced',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(fresh ? { 'Cache-Control': 'no-cache' } : {})
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(120000)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location');
      if (!next) throw Error('Missing redirect');
      current = new URL(next, current);
      continue;
    }
    if (!response.ok)
      throw Error(
        response.status === 403 || response.status === 429
          ? 'GitHub update checks are temporarily rate limited'
          : `Download failed (${response.status})`
      );
    const chunks = [];
    let size = 0;
    for await (const part of response.body) {
      size += part.length;
      if (size > limit) throw Error('Download exceeded its expected size');
      chunks.push(part);
    }
    return Buffer.concat(chunks);
  }
  throw Error('Too many download redirects');
}
export function verifyBytes(bytes, asset) {
  if (bytes.length !== asset.size || createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
    throw Error('Downloaded release failed SHA-256 verification');
  return bytes;
}
export function verifyInstaller(bytes) {
  const offset = bytes.length >= 64 ? bytes.readUInt32LE(60) : 0;
  if (
    bytes.toString('ascii', 0, 2) !== 'MZ' ||
    offset < 64 ||
    offset + 6 > bytes.length ||
    bytes.readUInt32LE(offset) !== 0x4550 ||
    ![0x14c, 0x8664].includes(bytes.readUInt16LE(offset + 4))
  )
    throw Error('Release asset is not a Windows x86/x64 installer');
  return bytes;
}
export async function checkUpdate(current, config, { fetcher = fetch, fresh = false, allowCurrent = false } = {}) {
  if (!config?.repository) return null;
  const raw = await fetchBytes(`https://api.github.com/repos/${repository(config.repository)}/releases?per_page=30`, {
    limit: 2 * 1024 * 1024,
    fetcher,
    fresh,
    accept: 'application/vnd.github+json'
  });
  const selected = selectRelease(JSON.parse(raw), current, config, { allowCurrent });
  if (!selected) return null;
  const v = version(selected.tag_name).text;
  const metadata = releaseAsset(selected, 'release.json', config.repository, 65536);
  const manifest = JSON.parse(
    verifyBytes(await fetchBytes(metadata.browser_download_url, { limit: metadata.size, fetcher }), metadata)
  );
  if (manifest.version !== v) throw Error('Release metadata does not match its tag');
  if (config.nativeInstall === 1 && manifest.nativeLoader?.schema !== 1)
    throw Error('This release does not support native loading');
  const hashes = manifest.supportedClient?.resourceHashes;
  if (
    !hashes ||
    Object.keys(hashes).length !== 2 ||
    !['html/client_ui/main.js', 'html/client_ui/main.css'].every(p => /^[a-f0-9]{64}$/i.test(hashes[p] || ''))
  )
    throw Error('Invalid TeamSpeak compatibility metadata');
  const installer = releaseAsset(selected, `TS6-Enhanced-${v}-Setup.exe`, config.repository, 512 * 1024 * 1024);
  return { version: v, manifest, installer };
}
export async function compatible(update, client) {
  for (const [file, hash] of Object.entries(update.manifest.supportedClient.resourceHashes)) {
    if (!['html/client_ui/main.js', 'html/client_ui/main.css'].includes(file))
      throw Error('Unexpected client resource');
    const bytes = await readFile(join(client, file));
    if (createHash('sha256').update(bytes).digest('hex').toLowerCase() !== hash.toLowerCase()) return false;
  }
  if (update.manifest.nativeLoader?.schema === 1) {
    const images = update.manifest.supportedClient.nativeImages;
    if (!images || Object.keys(images).length !== 3) return false;
    for (const file of ['TeamSpeak.exe', 'TeamSpeak.dll', 'libcef.dll']) {
      if (!/^[a-f0-9]{64}$/i.test(images[file]?.sha256 || '')) return false;
      if (
        createHash('sha256')
          .update(await readFile(join(client, file)))
          .digest('hex') !== images[file].sha256.toLowerCase()
      )
        return false;
    }
  }
  return true;
}
// An update notice is informational. Resolve and validate the release again at
// download time; a failed check must never fall back to an earlier offer.
export async function stageLatestUpdate(current, config, client, root, { onSelected = () => {}, ...options } = {}) {
  const update = await checkUpdate(current, config, { ...options, fresh: true });
  if (!update) return null;
  if (update.manifest.updates?.deferredInstall !== 1) throw Error('This release requires a manual installation');
  if (update.manifest.updates?.sessionRestore !== 1)
    throw Error(
      'This release does not support session restoration. Install it manually when your session is finished.'
    );
  if (!(await compatible(update, client))) throw Error('The latest release needs a different TeamSpeak version');
  await onSelected(update);
  return { update, path: await stageUpdate(update, root, options) };
}
export async function stageUpdate(update, root, options = {}) {
  await plainPath(root);
  await mkdir(root, { recursive: true });
  const name = `TS6-Enhanced-${version(update.version).text}-Setup.exe`,
    path = join(root, name);
  await plainPath(path);
  let cached;
  try {
    cached = await readFile(path);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (cached) {
    try {
      verifyInstaller(verifyBytes(cached, update.installer));
      return path;
    } catch {
      await rename(path, `${path}.${randomUUID()}.rejected`);
    }
  }
  const bytes = verifyInstaller(
    verifyBytes(
      await fetchBytes(update.installer.browser_download_url, { ...options, limit: update.installer.size }),
      update.installer
    )
  );
  const partial = `${path}.${randomUUID()}.partial`;
  try {
    await writeFile(partial, bytes, { flag: 'wx' });
    await rename(partial, path);
  } finally {
    await unlink(partial).catch(e => {
      if (e.code !== 'ENOENT') throw e;
    });
  }
  return path;
}

// A queued installer is bookkeeping, not a reason to stop checking for newer
// releases. Every confirmed update installs the complete package and restarts.
export async function createUpdateSession(release, client, root, { fetcher = fetch } = {}) {
  const receipt = join(root, 'pending-update.json');
  let queued = await readJSON(receipt).catch(() => null),
    applyError = null;
  const readApplyError = async () => {
    applyError = await readJSON(join(root, 'native-error.json')).catch(() => null);
  };
  await readApplyError();
  try {
    if (
      queued?.schema !== 2 ||
      queued.mode !== 'next-launch' ||
      ![queued.fromVersion, queued.version].includes(release.version) ||
      compareVersions(queued.version, release.version) < 0
    )
      queued = null;
  } catch {
    queued = null;
  }
  const newest = () => queued?.version || release.version;
  const snapshot = () => {
    const repair = queued?.version === release.version && /^[a-f0-9]{64}$/i.test(queued.sha256 || '');
    const pending = repair || compareVersions(newest(), release.version) > 0 ? displayVersion(newest()) : null;
    const failed =
      pending &&
      queued.sha256 &&
      applyError?.update?.sha256 === queued.sha256 &&
      applyError.update.version === queued.version &&
      typeof applyError.message === 'string';
    const message = failed
      ? 'Update couldn’t finish. It will retry when you next open TeamSpeak.'
      : pending
        ? 'Version ' + pending + ' is ready. Restart and restore your session to apply it.'
        : 'You’re up to date.';
    return {
      version: displayVersion(release.version),
      pending,
      available: null,
      detail: failed ? applyError.message : null,
      message
    };
  };
  return {
    snapshot,
    async check() {
      await readApplyError();
      const update = await checkUpdate(newest(), release.updates, { fetcher, fresh: true });
      if (update && !(await compatible(update, client)))
        return { ...snapshot(), message: 'This update needs a different TeamSpeak version.' };
      return update
        ? {
            ...snapshot(),
            available: displayVersion(update.version),
            message: `Version ${displayVersion(update.version)} is available.`
          }
        : snapshot();
    },
    async download(onSelected) {
      const repair = queued?.version === release.version && /^[a-f0-9]{64}$/i.test(queued.sha256 || '');
      const selected = await stageLatestUpdate(release.version, release.updates, client, join(root, 'updates'), {
        fetcher,
        allowCurrent: repair,
        onSelected: update => {
          if (compareVersions(update.version, newest()) < 0)
            throw Error('The downloaded release is no longer published. Check again later.');
          return onSelected?.(update);
        }
      });
      if (!selected)
        return snapshot().pending
          ? { ...snapshot(), message: 'The downloaded release is no longer published. Check again later.' }
          : snapshot();
      const { update, path } = selected;
      const next = {
        schema: 2,
        mode: 'next-launch',
        fromVersion: release.version,
        path,
        version: update.version,
        sha256: update.installer.sha256,
        resourceHashes: update.manifest.supportedClient.resourceHashes
      };
      // Keep the previous queue intact until the replacement is fully verified
      // and its receipt is durable. The launcher still installs fromVersion.
      await atomicJSON(receipt, next);
      queued = next;
      return { ...snapshot(), restartReady: true };
    },
    queued: () => queued
  };
}
