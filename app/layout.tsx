import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AppProvider } from '@/features/app/app-provider';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SingleRent — Nigerian rental platform',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/singlerent-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/singlerent-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/singlerent-icon-192.png',
    apple: '/singlerent-icon-192.png',
  },
  appleWebApp: { capable: true, title: 'SingleRent', statusBarStyle: 'default' },
  description:
    'Find verified Nigerian rental homes and make secure rental payments.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
