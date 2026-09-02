import { adultAllowed, getActivePlaylist, getLiveCategories, getLiveChannels, getMovieCategories, getMovies, getSeriesCategories, getSeriesPage } from '@streamwise/core';
import { ensureServerBooted } from '../runtime';
import { fail, fromError, limited, num, ok } from '../respond';
import { LIMITS } from '../security/rateLimit';

/** Bind core to this platform before any handler runs. */
ensureServerBooted();

/**
 * One read endpoint for the catalog, parameterized by `kind`.
 *
 * `?kind=live|movie|series` with `categories=1` for the category list, or
 * `categoryId` / `offset` / `limit` / `ids` for the item list.
 */
export async function GET(req: Request) {
  const rateLimited = limited(req, 'catalog', LIMITS.api);
  if (rateLimited) return rateLimited;

  const params = new URL(req.url).searchParams;
  const kind = params.get('kind') ?? 'live';

  let playlistId = params.get('playlistId');
  if (!playlistId) playlistId = (await getActivePlaylist())?.id ?? null;
  if (!playlistId) return ok({ items: [], total: 0, offset: 0, limit: 0, noPlaylist: true });

  // Deliberately NOT taken from the query string: a client cannot opt
  // itself back into adult content by editing a URL.
  const includeAdult = await adultAllowed();

  try {
    if (params.get('categories') === '1') {
      const categories =
        kind === 'movie'
          ? await getMovieCategories(playlistId)
          : kind === 'series'
            ? await getSeriesCategories(playlistId)
            : await getLiveCategories(playlistId);
      return ok({ categories });
    }

    const query = {
      playlistId,
      categoryId: params.get('categoryId'),
      genre: params.get('genre'),
      offset: num(params.get('offset'), 0),
      limit: num(params.get('limit'), kind === 'live' ? 200 : 60),
      includeAdult,
      ids: params.get('ids')?.split(',').filter(Boolean),
    };

    if (kind === 'movie') return ok(await getMovies(query));
    if (kind === 'series') return ok(await getSeriesPage(query));
    if (kind === 'live') return ok(await getLiveChannels(query));
    return fail('Unknown catalog kind.');
  } catch (err) {
    return fromError(err);
  }
}
