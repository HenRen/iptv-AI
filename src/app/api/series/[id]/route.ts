import { getSeriesInfo } from '@/lib/iptv/IPTVService';
import { getActivePlaylist } from '@/lib/iptv/playlists';
import { fail, fromError, ok } from '../../_lib/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const playlistId =
    new URL(req.url).searchParams.get('playlistId') ?? (await getActivePlaylist())?.id;
  if (!playlistId) return fail('Connect a playlist first.', 409);
  try {
    const series = await getSeriesInfo(playlistId, decodeURIComponent(id));
    if (!series) return fail('Series not found.', 404);
    return ok(series);
  } catch (err) {
    return fromError(err);
  }
}
