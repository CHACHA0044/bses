export const config = {
  apiUrl: typeof window !== 'undefined' ? '/api' : (process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'),
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'BSES Consumer Portal',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.bsesonline.in',
};
