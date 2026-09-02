import { getStorage, KEYS } from '@/lib/storage';
import { getActivePlaylist } from '@/lib/iptv/playlists';
import { fail, fromError, ok } from '../_lib/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AppSettings {
  activePlaylistId?: string;
  hiddenCategories?: Record<string, string[]>;
  allowAdult?: boolean;
}

/**
 * App-level settings the *server* needs in order to filter correctly.
 *
 * Parental choices are mirrored here rather than applied only in the browser:
 * adult and hidden content is then excluded before it is ever serialized into
 * a response, which is the difference between "not shown" and "not sent".
 */
export async function GET() {
  const settings = (await getStorage().getJSON<AppSettings>(KEYS.settings)) ?? {};
  return ok({
    hiddenCategories: settings.hiddenCategories ?? {},
    allowAdult: Boolean(settings.allowAdult),
  });
}

export async function PATCH(req: Request) {
  let body: { hiddenCategories?: string[]; allowAdult?: boolean; playlistId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail('Malformed request body.');
  }

  try {
    const storage = getStorage();
    const current = (await storage.getJSON<AppSettings>(KEYS.settings)) ?? {};
    const playlistId = body.playlistId ?? (await getActivePlaylist())?.id;
    if (!playlistId) return fail('No playlist is configured.', 409);

    const next: AppSettings = { ...current };

    if (Array.isArray(body.hiddenCategories)) {
      next.hiddenCategories = {
        ...(current.hiddenCategories ?? {}),
        // Cap the list so a malformed client cannot write an unbounded blob.
        [playlistId]: body.hiddenCategories.filter((id) => typeof id === 'string').slice(0, 2000),
      };
    }
    if (typeof body.allowAdult === 'boolean') next.allowAdult = body.allowAdult;

    await storage.setJSON(KEYS.settings, next);
    return ok({
      hiddenCategories: next.hiddenCategories ?? {},
      allowAdult: Boolean(next.allowAdult),
    });
  } catch (err) {
    return fromError(err);
  }
}
