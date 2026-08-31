import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Zap, Server, Database, Network, ShieldCheck, Building2, MapPin, Phone, BarChart3, Award, Users } from 'lucide-react';

export const metadata = {
  title: 'About BSES Delhi | Discom Overview & Operational Statistics',
  description: 'BSES Rajdhani Power Limited (BRPL) - Joint venture of Reliance Infrastructure and Govt of NCT of Delhi powering 31.89+ lakh consumers.',
};

const operationalStats = [
  { param: 'Registered Consumers', uom: 'Lakhs', fy02: '9.69', fy24: '30.77', fy25: '31.89', change: '+229%' },
  { param: 'Consumer Density', uom: 'Per Sq. Km', fy02: '1,404', fy24: '4,454', fy25: '4,615', change: '+229%' },
  { param: 'AT&C Losses', uom: '%', fy02: '51.50%', fy24: '6.61%', fy25: '6.13%', change: '-88%' },
  { param: 'Peak Demand Handled', uom: 'MW', fy02: '1,272', fy24: '3,250', fy25: '3,809', change: '+199%' },
  { param: 'Total EHV Grid Stations', uom: 'No.', fy02: '63', fy24: '108', fy25: '114', change: '+81%' },
  { param: 'EHV Feeders', uom: 'No.', fy02: '132', fy24: '269', fy25: '284', change: '+115%' },
  { param: 'EHV Lines & Cables', uom: 'Ckt Km', fy02: '674', fy24: '1,310', fy25: '1,377', change: '+104%' },
  { param: 'Power Transformers', uom: 'No.', fy02: '146', fy24: '284', fy25: '293', change: '+101%' },
  { param: '11 KV Feeders', uom: 'No.', fy02: '733', fy24: '1,727', fy25: '1,768', change: '+141%' },
  { param: 'Distribution Transformers', uom: 'No.', fy02: '4,852', fy24: '10,799', fy25: '11,161', change: '+130%' },
  { param: 'LT Lines & Cables', uom: 'Ckt Km', fy02: '5,382', fy24: '14,573', fy25: '15,133', change: '+181%' },
];

const divisions = [
  'Alaknanda', 'Dwarka', 'Hauz Khas', 'Jaffarpur', 'Janak Puri', 'Khanpur',
  'Mundka', 'Najafgarh', 'Nangloi', 'Nehru Place', 'New Friends Colony',
  'Nizamuddin', 'Palam', 'Punjabi Bagh', 'R.K. Puram', 'Saket', 'Chhattarpur',
  'Sarita Vihar', 'Tagore Garden', 'Vasant Kunj', 'Vikas Puri', 'Uttam Nagar', 'Mohan Garden'
];

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />

      <main className="flex-1 py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-8 w-full">
        {/* Header */}
        <div className="space-y-3 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1 text-xs font-bold text-primary border border-primary/20">
            <Zap className="h-4 w-4 text-primary" />
            <span>Unofficial Discom Profile</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-heading">
            About BSES Rajdhani Power Limited (BRPL)
          </h1>
          <p className="text-sm text-slate-500 max-w-3xl">
            A Joint Venture between Reliance Infrastructure (51% majority stake) and the Government of NCT of Delhi (49%), supplying reliable electricity across ~700 sq. km serving 1.2+ crore citizens.
          </p>
        </div>

        {/* Highlight Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1.5">
            <div className="p-2.5 bg-amber-500 text-slate-950 rounded-xl w-fit font-bold">
              <Users className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Consumer Base</p>
            <p className="text-2xl font-extrabold text-slate-900 font-heading">31.89+ Lakhs</p>
            <p className="text-xs text-slate-500">Across 23 operational divisions</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1.5">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl w-fit font-bold">
              <BarChart3 className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">AT&amp;C Loss Reduction</p>
            <p className="text-2xl font-extrabold text-emerald-600 font-heading">6.13%</p>
            <p className="text-xs text-slate-500">Down from 51.50% in 2002 (-88%)</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1.5">
            <div className="p-2.5 bg-surface-dark text-white rounded-xl w-fit font-bold">
              <Building2 className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Distribution Area</p>
            <p className="text-2xl font-extrabold text-slate-900 font-heading">~700 Sq. Km</p>
            <p className="text-xs text-slate-500">Serving South &amp; West Delhi</p>
          </div>
        </div>

        {/* Company Overview Section */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8 text-sm text-slate-700">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2 font-heading">
              Company Overview &amp; Infrastructure
            </h2>
            <p className="leading-relaxed text-slate-600">
              BSES Rajdhani Power Limited (BRPL) caters to more than 1.2 crore residents across 23 divisions in South and West Delhi. Since privatization in 2002, the Aggregate Technical &amp; Commercial (AT&amp;C) losses in our distribution area have drastically declined from a peak of 51.50% to a record low of 6.13% in FY 2024-25.
            </p>
          </section>

          {/* Operational Divisions Pill Cloud */}
          <section className="space-y-3">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider font-heading">
              Operational Divisions (23 Circles)
            </h3>
            <div className="flex flex-wrap gap-2">
              {divisions.map((div) => (
                <span
                  key={div}
                  className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs font-bold text-slate-700"
                >
                  {div}
                </span>
              ))}
            </div>
          </section>

          {/* Operational Statistics Table */}
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2 font-heading flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-amber-600" />
              Operational Growth Benchmark (2002 vs 2025)
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3">Network Parameter</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3">FY 2002-03</th>
                    <th className="p-3">FY 2023-24</th>
                    <th className="p-3 font-bold text-slate-900">FY 2024-25</th>
                    <th className="p-3 text-emerald-600">% Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {operationalStats.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-bold text-slate-900">{row.param}</td>
                      <td className="p-3">{row.uom}</td>
                      <td className="p-3 text-slate-400">{row.fy02}</td>
                      <td className="p-3">{row.fy24}</td>
                      <td className="p-3 font-extrabold text-slate-900">{row.fy25}</td>
                      <td className="p-3 font-bold text-emerald-600">{row.change}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Microservices Architecture */}
          <section className="space-y-4 border-t border-slate-100 pt-6">
            <h2 className="text-lg font-bold text-slate-900 font-heading">
              Enterprise Digital Portal Architecture
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                <Network className="h-6 w-6 text-primary" />
                <h3 className="font-bold text-slate-900 text-sm font-heading">API Gateway</h3>
                <p className="text-slate-500">Centralized proxy routing request correlation IDs across services.</p>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                <Server className="h-6 w-6 text-surface-dark" />
                <h3 className="font-bold text-slate-900 text-sm font-heading">Microservices</h3>
                <p className="text-slate-500">Decoupled Auth, Consumer, Document, and Notification domain microservices.</p>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                <Database className="h-6 w-6 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-sm font-heading">Dual Vault Storage</h3>
                <p className="text-slate-500">PostgreSQL Prisma ORM for relational metadata + MongoDB GridFS for document binaries.</p>
              </div>
            </div>
          </section>

          {/* DPDP Compliance */}
          <section className="space-y-3 border-t border-slate-100 pt-6">
            <h2 className="text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              DPDP Act 2023 Compliance &amp; PII Vault
            </h2>
            <p className="leading-relaxed text-slate-600">
              This portal enforces explicit consent tracking, AES-256 PII field encryption, blind indexing, and automated data principal rights under India’s Digital Personal Data Protection Act 2023.
            </p>
          </section>

          {/* Corporate Office Location */}
          <section className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2 font-heading">
              <Building2 className="w-4 h-4 text-primary" />
              BSES Corporate Office Contact Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
              <div>
                <p className="font-bold text-slate-800">Headquarters Address:</p>
                <p>BSES Rajdhani Power Limited, BSES Bhawan, Nehru Place, New Delhi - 110019</p>
                <p className="text-slate-400 mt-0.5">(Landmark: Nehru Place Bus Terminus)</p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-800">Telephone / CIN:</p>
                <p>Ph: 011-49209999 | Emergency: 19123</p>
                <p className="text-slate-400">CIN: U40109DL2001PLC111527</p>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
