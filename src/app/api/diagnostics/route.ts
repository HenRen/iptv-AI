import { diagnostics } from '@/lib/iptv/IPTVService';
import { getActivePlaylist } from '@/lib/iptv/playlists';
import { fail, fromError, ok } from '../_lib/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Diagnostics never include the password, the username, or any URL that
 * carries them — see DiagnosticsReport in src/types.
 */
export async function GET(req: Request) {
  const playlistId =
    new URL(req.url).searchParams.get('playlistId') ?? (await getActivePlaylist())?.id;
  if (!playlistId) return fail('No playlist is configured.', 409);
  try {
    const report = await diagnostics(playlistId);
    if (!report) return fail('Playlist not found.', 404);
    return ok(report);
  } catch (err) {
    return fromError(err);
  }
}
