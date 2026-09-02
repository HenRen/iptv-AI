import { getActivePlaylist, search } from '@streamwise/core';
import { ensureServerBooted } from '../runtime';
import { fromError, limited, num, ok } from '../respond';
import { LIMITS } from '../security/rateLimit';

/** Bind core to this platform before any handler runs. */
ensureServerBooted();

export async function GET(req: Request) {
  const rateLimited = limited(req, 'search', { rate: 20, burst: 40 });
  if (rateLimited) return rateLimited;

  const params = new URL(req.url).searchParams;
  const q = params.get('q') ?? '';
  const playlistId = params.get('playlistId') ?? (await getActivePlaylist())?.id;
  if (!playlistId) return ok({ channels: [], movies: [], series: [], programs: [] });

  try {
    return ok(await search(playlistId, q, num(params.get('limit'), 20)));
  } catch (err) {
    return fromError(err);
  }
}
