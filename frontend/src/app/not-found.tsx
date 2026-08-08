import Link from 'next/link';
import { Home, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="rounded-full bg-amber-100 p-4 text-amber-600 mb-4">
        <Search className="h-8 w-8" />
      </div>
      <h1 className="text-4xl font-extrabold text-slate-900">404 — Page Not Found</h1>
      <p className="mt-2 text-sm text-slate-500 max-w-md">
        The requested resource or page does not exist on the BSES Consumer Portal.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-bses-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm"
      >
        <Home className="h-4 w-4" />
        Return to Portal Home
      </Link>
    </div>
  );
}
