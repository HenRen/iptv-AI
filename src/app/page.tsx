import { redirect } from 'next/navigation';
import { getPlaylists } from '@/lib/iptv/IPTVService';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const playlists = await getPlaylists();
  redirect(playlists.length === 0 ? '/welcome' : '/home');
}
