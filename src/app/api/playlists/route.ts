import { NextResponse } from 'next/server';
import {
  connectM3UFile,
  connectM3UUrl,
  connectMock,
  connectXtream,
  getPlaylists,
} from '@/lib/iptv/IPTVService';
import { deletePlaylist, setActivePlaylist, getActivePlaylist } from '@/lib/iptv/playlists';
import { fail, fromError, limited, ok } from '../_lib/respond';
import { LIMITS } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [playlists, active] = await Promise.all([getPlaylists(), getActivePlaylist()]);
  return ok({ playlists, activePlaylistId: active?.id ?? null });
}

interface ConnectBody {
  type?: 'xtream' | 'm3u-url' | 'm3u-file' | 'mock';
  name?: string;
  host?: string;
  username?: string;
  password?: string;
  url?: string;
  epgUrl?: string;
  content?: string;
}

export async function POST(req: Request) {
  const rateLimited = limited(req, 'connect', LIMITS.connect);
  if (rateLimited) return rateLimited;

  let body: ConnectBody;
  try {
    body = (await req.json()) as ConnectBody;
  } catch {
    return fail('Malformed request body.');
  }

  const name = (body.name ?? '').trim();

  try {
    switch (body.type) {
      case 'xtream': {
        if (!body.host?.trim()) return fail('A server URL is required.');
        if (!body.username?.trim() || !body.password) {
          return fail('A username and password are required.');
        }
        const result = await connectXtream({
          name,
          host: body.host.trim(),
          username: body.username.trim(),
          password: body.password,
        });
        return ok(result);
      }
      case 'm3u-url': {
        if (!body.url?.trim()) return fail('An M3U URL is required.');
        const result = await connectM3UUrl({
          name,
          url: body.url.trim(),
          epgUrl: body.epgUrl?.trim() || undefined,
        });
        return ok(result);
      }
      case 'm3u-file': {
        if (!body.content || body.content.length < 7) return fail('The uploaded file was empty.');
        if (!body.content.includes('#EXTM3U') && !body.content.includes('#EXTINF')) {
          return fail('That file does not look like an M3U playlist.');
        }
        const result = await connectM3UFile({ name, text: body.content });
        return ok(result);
      }
      case 'mock': {
        return ok(await connectMock(name || 'Mock Provider'));
      }
      default:
        return fail('Unknown playlist type.');
    }
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('A playlist id is required.');
  await deletePlaylist(id);
  const next = await getActivePlaylist();
  if (next) await setActivePlaylist(next.id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  let body: { activePlaylistId?: string };
  try {
    body = (await req.json()) as { activePlaylistId?: string };
  } catch {
    return fail('Malformed request body.');
  }
  if (!body.activePlaylistId) return fail('activePlaylistId is required.');
  await setActivePlaylist(body.activePlaylistId);
  return NextResponse.json({ ok: true });
}
