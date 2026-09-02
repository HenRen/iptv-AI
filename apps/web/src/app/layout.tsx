import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * Space Grotesk is the design's voice — geometric, slightly mechanical, and
 * legible at distance.
 *
 * It is self-hosted: the @font-face rules are in globals.css and the files
 * are in /public/fonts. Neither the build nor the running app fetches a
 * webfont from anywhere, which keeps air-gapped CI working and keeps a set
 * that cannot reach a CDN from hanging on the stylesheet request. The
 * Tailwind `sans` stack still falls back to the platform UI face, so the app
 * stays legible even if a font file is missing.
 */
export const metadata: Metadata = {
  title: 'StreamWise',
  description: 'Your TV. Your content. Smarter.',
};

export const viewport: Viewport = {
  themeColor: '#0A0F1E',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
