import { refreshPlaylist } from '@/lib/iptv/IPTVService';
import { fromError, limited, ok } from '../../../_lib/respond';
import { LIMITS } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
