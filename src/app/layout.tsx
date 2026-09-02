import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * Space Grotesk is the design's voice — geometric, slightly mechanical, and
 * legible at distance.
 *
 * Linked at runtime rather than through `next/font` because the build
 * environment has no route to Google Fonts, and a build that depends on
 * fetching a webfont is a build that fails in any sandboxed or air-gapped CI.
 * The `--font-grotesk` variable is what Tailwind reads, and the stack falls
 * back to the platform UI face if the link never resolves, so the app stays
 * legible either way.
 *
 * To self-host instead: drop the .woff2 files into /public/fonts, declare
 * @font-face in globals.css against the same variable, and delete this link.
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
