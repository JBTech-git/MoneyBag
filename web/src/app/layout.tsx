import type { Metadata, Viewport } from 'next';
import './globals.css';
import '../styles/app.css';

export const metadata: Metadata = {
  title: 'Moneybag',
  description: 'Moneybag — personal finance manager',
  applicationName: 'Moneybag',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Moneybag',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: '/icons/app-icon.png?v=5', type: 'image/png', sizes: '32x32' }],
    apple: [{ url: '/icons/apple-touch-icon.png?v=6', type: 'image/png', sizes: '180x180' }],
    shortcut: ['/icons/app-icon.png?v=5'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1E3A8A' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1220' },
  ],
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Moneybag" />
        <link rel="icon" href="/icons/app-icon.png?v=5" type="image/png" sizes="32x32" />
        <link rel="shortcut icon" href="/icons/app-icon.png?v=5" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=6" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet" />
      </head>
      <body className="bg-md-surface-container font-sans text-md-on-surface" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
