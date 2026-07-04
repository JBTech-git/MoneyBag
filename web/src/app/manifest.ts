import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Moneybag',
    short_name: 'Moneybag',
    description: 'Personal finance manager — track daily spending and monthly budgets',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'browser'],
    orientation: 'portrait-primary',
    background_color: '#1E3A8A',
    theme_color: '#1E3A8A',
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/icons/app-icon.png',
        sizes: '84x77',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/app-icon-192.png',
        sizes: '84x77',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/app-icon-512.png',
        sizes: '84x77',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/app-icon-512.png',
        sizes: '84x77',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
