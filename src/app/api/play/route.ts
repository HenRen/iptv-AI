import { getStreamSource } from '@/lib/iptv/IPTVService';
import { getActivePlaylist } from '@/lib/iptv/playlists';
import { fail, fromError, limited, ok } from '../_lib/respond';
import { LIMITS } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hands the client a PlaybackSource: proxied URLs only, never credentials. */
export async function GET(req: Request) {
  const rateLimited = limited(req, 'play', { rate: 10, burst: 30 });
  if (rateLimited) return rateLimited;

  const params = new URL(req.url).searchParams;
  const kind = params.get('kind');
  const id = params.get('id');
  if (kind !== 'live' && kind !== 'movie' && kind !== 'episode') return fail('Unknown stream kind.');
  if (!id) return fail('A content id is required.');

  const playlistId = params.get('playlistId') ?? (await getActivePlaylist())?.id;
  if (!playlistId) return fail('Connect a playlist first.', 409);

  try {
    const source = await getStreamSource(playlistId, kind, id);
    if (!source) return fail('That item is not in the current playlist.', 404);
    return ok(source);
  } catch (err) {
    return fromError(err);
  }
}
