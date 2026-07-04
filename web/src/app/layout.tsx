import type { Metadata } from 'next';
import './globals.css';
import '../styles/app.css';

export const metadata: Metadata = {
  title: 'Moneybag',
  description: 'Moneybag — personal finance manager',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#F97316" />
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
