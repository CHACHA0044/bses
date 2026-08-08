import React from 'react';
import Link from 'next/link';
import { Logo } from '../common/Logo';
import { ShieldCheck, Phone, Mail, MapPin, ExternalLink } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-800 bg-surface-dark text-slate-300 text-xs">
      <div className="page-container py-12 grid grid-cols-1 gap-8 md:grid-cols-4">
        {/* Col 1: Identity */}
        <div className="space-y-4">
          <div className="inline-block rounded-xl bg-white p-2">
            <Logo size="sm" />
          </div>
          <p className="text-slate-400 leading-relaxed">
            Official Electricity Consumer Service &amp; Digital Connection Management Portal for BSES Rajdhani Power Limited (BRPL) and BSES Yamuna Power Limited (BYPL).
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-green-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            DPDP Act 2023 Compliant
          </span>
        </div>

        {/* Col 2: Consumer Services */}
        <div className="space-y-3">
          <h4 className="font-heading font-bold text-white uppercase text-xs tracking-wider">Consumer Services</h4>
          <ul className="space-y-2 text-slate-400">
            <li><Link href="/connections/apply" className="hover:text-accent transition">New Connection Application</Link></li>
            <li><Link href="/connections" className="hover:text-accent transition">Track Application Status</Link></li>
            <li><Link href="/profile" className="hover:text-accent transition">Consumer Profile</Link></li>
            <li><Link href="/help-center" className="hover:text-accent transition">Helpline &amp; FAQs</Link></li>
          </ul>
        </div>

        {/* Col 3: Legal */}
        <div className="space-y-3">
          <h4 className="font-heading font-bold text-white uppercase text-xs tracking-wider">Governance &amp; Privacy</h4>
          <ul className="space-y-2 text-slate-400">
            <li><Link href="/privacy-policy" className="hover:text-accent transition">Privacy Policy</Link></li>
            <li><Link href="/dpdp-act" className="hover:text-accent transition">DPDP Data Principal Rights</Link></li>
            <li><Link href="/about" className="hover:text-accent transition">Architecture &amp; Security</Link></li>
            <li>
              <a href="https://www.bsesdelhi.com" target="_blank" rel="noreferrer" className="hover:text-accent transition inline-flex items-center gap-1">
                BSES Official Portal <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          </ul>
        </div>

        {/* Col 4: Contact */}
        <div className="space-y-3">
          <h4 className="font-heading font-bold text-white uppercase text-xs tracking-wider">24×7 Emergency</h4>
          <div className="space-y-2 text-slate-400">
            <p className="flex items-center gap-2 font-bold text-accent">
              <Phone className="h-4 w-4" /> Toll Free: 19123
            </p>
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-500" /> customercare@bsesdelhi.com
            </p>
            <p className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
              <span>BSES Bhawan, Nehru Place, New Delhi - 110019</span>
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 py-6 text-center text-slate-500 text-[11px]">
        <div className="page-container flex flex-col gap-2 md:flex-row md:justify-between md:items-center">
          <p>© 2026 BSES Delhi Discom (BRPL &amp; BYPL). Enterprise Application Foundation.</p>
          <p>AES-256 Encrypted · GridFS Vault · Microservices Architecture</p>
        </div>
      </div>
    </footer>
  );
};
