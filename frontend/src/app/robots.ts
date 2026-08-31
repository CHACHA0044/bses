import type { MetadataRoute } from 'next';
import { config } from '@/config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/about', '/help-center', '/dpdp-act', '/privacy-policy', '/login', '/register', '/forgot-password'],
        disallow: ['/dashboard', '/profile', '/settings', '/connections', '/admin', '/api/'],
      },
    ],
    sitemap: `${config.siteUrl}/sitemap.xml`,
  };
}
