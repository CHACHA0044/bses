import type { MetadataRoute } from 'next';
import { config } from '@/config';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = config.siteUrl;
  const routes = [
    '',
    '/about',
    '/help-center',
    '/dpdp-act',
    '/privacy-policy',
    '/login',
    '/register',
    '/forgot-password',
  ];

  return routes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : route.startsWith('/login') || route.startsWith('/register') ? 0.9 : 0.6,
  }));
}
