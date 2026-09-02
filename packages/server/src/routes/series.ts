import { getActivePlaylist, getSeriesInfo } from '@streamwise/core';
import { ensureServerBooted } from '../runtime';
import { fail, fromError, ok } from '../respond';

/** Bind core to this platform before any handler runs. */
ensureServerBooted();

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
