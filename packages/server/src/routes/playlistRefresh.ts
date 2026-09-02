import { refreshPlaylist } from '@streamwise/core';
import { ensureServerBooted } from '../runtime';
import { fromError, limited, ok } from '../respond';
import { LIMITS } from '../security/rateLimit';

/** Bind core to this platform before any handler runs. */
ensureServerBooted();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const rateLimited = limited(req, 'connect', LIMITS.connect);
  if (rateLimited) return rateLimited;
  const { id } = await ctx.params;
  try {
    return ok(await refreshPlaylist(id));
  } catch (err) {
    return fromError(err);
  }
}
