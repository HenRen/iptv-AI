import { HOUR, allowedHostsFor, getActivePlaylist, getEPG, getNowNext, setCustomEpg } from '@streamwise/core';
import { ensureServerBooted } from '../runtime';
import { assertSafeUrl } from '../security/urlGuard';
import { fail, fromError, limited, num, ok } from '../respond';
import { LIMITS } from '../security/rateLimit';

/** Bind core to this platform before any handler runs. */
ensureServerBooted();

/**
 * `?channels=a,b,c&from=<ms>&to=<ms>`  -> full schedule blocks for the grid
 * `?channels=a,b,c&nownext=1`          -> just now/next, for channel rows
 */
export async function GET(req: Request) {
  const rateLimited = limited(req, 'epg', LIMITS.api);
  if (rateLimited) return rateLimited;

  const params = new URL(req.url).searchParams;
  const playlistId = params.get('playlistId') ?? (await getActivePlaylist())?.id;
  if (!playlistId) return ok({ schedules: [] });

  const channelIds = (params.get('channels') ?? '').split(',').filter(Boolean);
  if (channelIds.length === 0) return ok({ schedules: [] });
  if (channelIds.length > 300) return fail('Too many channels requested at once.');

  try {
    if (params.get('nownext') === '1') {
      return ok({ nowNext: await getNowNext(playlistId, channelIds) });
    }
    const from = num(params.get('from'), Date.now() - HOUR);
    const to = num(params.get('to'), from + 4 * HOUR);
    if (to <= from || to - from > 7 * 24 * HOUR) return fail('Invalid time window.');
    return ok({ schedules: await getEPG(playlistId, channelIds, from, to) });
  } catch (err) {
    return fromError(err);
  }
}

/** Load a custom XMLTV guide, either by URL or by uploaded content. */
export async function POST(req: Request) {
  const rateLimited = limited(req, 'connect', LIMITS.connect);
  if (rateLimited) return rateLimited;

  let body: { playlistId?: string; url?: string; content?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail('Malformed request body.');
  }

  const playlistId = body.playlistId ?? (await getActivePlaylist())?.id;
  if (!playlistId) return fail('Connect a playlist first.');

  try {
    if (body.content) {
      const result = await setCustomEpg(playlistId, body.content, 'uploaded file');
      return ok(result);
    }
    if (!body.url) return fail('An XMLTV URL or file is required.');

    // A custom EPG host is not necessarily a playlist host, so it is added to
    // the allowlist for this playlist before it can be fetched.
    const hosts = await allowedHostsFor(playlistId);
    let host: string;
    try {
      host = new URL(body.url).hostname.toLowerCase();
    } catch {
      return fail('That is not a valid URL.');
    }
    hosts.add(host);
    const safe = await assertSafeUrl(body.url, { allowedHosts: hosts });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch(safe, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) return fail(`The XMLTV feed returned HTTP ${res.status}.`, 502);
      const xml = await res.text();
      const result = await setCustomEpg(playlistId, xml, body.url);
      return ok(result);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return fromError(err);
  }
}
