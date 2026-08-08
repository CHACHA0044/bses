import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ShieldCheck, Lock, Eye, FileText, CheckCircle2 } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy | BSES Delhi Electricity Consumer Portal',
  description: 'Privacy Policy and Data Protection Notice for BSES Rajdhani Power Limited & BSES Yamuna Power Limited.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />

      <main className="flex-1 py-10 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8 w-full">
        <div className="space-y-3 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-500/20">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Digital Personal Data Protection (DPDP) Act 2023 Compliant</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-heading">
            Privacy Policy &amp; Data Protection Notice
          </h1>
          <p className="text-sm text-slate-500">
            Version 1.0 • Effective Date: January 1, 2026 • BSES Rajdhani Power Limited &amp; BSES Yamuna Power Limited
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8 text-sm text-slate-700 leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2 font-heading">
              <Eye className="h-5 w-5 text-primary" />
              1. Purpose of Data Collection
            </h2>
            <p className="text-slate-600 leading-relaxed">
              BSES Delhi Discom (BRPL &amp; BYPL) collects personal identity and property information strictly for the purpose of executing statutory electricity utility operations, validating new connection applications, managing consumer accounts, issuing billing statements, and providing emergency technical services.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2 font-heading">
              <FileText className="h-5 w-5 text-surface-dark" />
              2. Categories of Data Collected
            </h2>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li><strong>Personal Identifiers:</strong> Name, Gender, Email address, Mobile number, Aadhaar number.</li>
              <li><strong>Property Data:</strong> Property address, Premises ownership proof, Land registration details.</li>
              <li><strong>Technical Data:</strong> Required electricity load (kW), CA Number, Meter number.</li>
              <li><strong>Session Data:</strong> IP Address, Browser User Agent, Session Cookies for authentication security.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2 font-heading">
              <Lock className="h-5 w-5 text-amber-600" />
              3. Encryption &amp; Storage Vault
            </h2>
            <p className="text-slate-600 leading-relaxed">
              All Personally Identifiable Information (PII) including mobile numbers and Aadhaar data is encrypted prior to storage in PostgreSQL database using <strong>256-bit AES-CBC encryption</strong> algorithms. Searchable fields utilize HMAC-SHA256 blind indexing. Binary property and identity documents are stored in an isolated <strong>MongoDB GridFS storage vault</strong> with strict access-control policies.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2 font-heading">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              4. Data Principal Rights
            </h2>
            <p className="text-slate-600">Under the DPDP Act 2023, every consumer reserves the following rights:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>Right to access summary of personal data held by BSES.</li>
              <li>Right to correction and updating of inaccurate profile details.</li>
              <li>Right to grievance redressal through the designated Data Protection Officer.</li>
              <li>Right to withdraw explicit consent for optional marketing communications.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 font-heading">Data Protection Officer Contact</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              For privacy concerns or DPDP data requests, contact our Data Protection Officer at:
            </p>
            <p className="text-xs font-mono font-semibold text-slate-800">
              Email: dpo@bsesdelhi.com | Toll Free: 19123 | Address: BSES Bhawan, Nehru Place, New Delhi 110019
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
