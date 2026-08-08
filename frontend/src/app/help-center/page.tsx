import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HelpCircle, Phone, Mail, MessageSquare, ShieldAlert, Sun, Zap, FileText } from 'lucide-react';
import { FaqAccordion } from '@/components/ui/FaqAccordion';

export const metadata = {
  title: 'Help Center & FAQs | BSES Delhi Electricity Consumer Portal',
  description: 'Official BSES Delhi help center, 24x7 emergency helplines, WhatsApp complaint registration, E-PLA dispute settlement, and FAQs.',
};

const faqs = [
  {
    q: 'How do I apply for a new electricity connection online?',
    a: 'Log in to your consumer account, click "Apply Connection" on the sidebar or dashboard, select required load (kW) and category (Domestic/Commercial/Industrial), upload identity proof (Aadhaar/PAN) and property proof, and submit.',
  },
  {
    q: 'How can I register a No-Current complaint via WhatsApp?',
    a: 'Simply save BSES WhatsApp number 8800919123 on your mobile, type "Hi", and select "No Current Complaint" or type your CA Number. You will instantly receive a complaint tracking number and technician dispatch update.',
  },
  {
    q: 'How do I apply for Solar Rooftop Net-Metering & PM Surya Ghar Subsidy?',
    a: 'Visit the Solar Net-Metering section on your dashboard or navigate to the Solar Net-Metering Portal on bsesdelhi.com to express interest. BSES technical teams inspect your roof capacity and install bidirectional meters for solar billing.',
  },
  {
    q: 'How can I install a private or semi-public EV Charger at my property?',
    a: 'BSES provides a single-window portal for EV Charger installation at private residences, housing societies, and commercial spots. Apply under EV Charger Booking on the dashboard to request a dedicated EV meter connection.',
  },
  {
    q: 'What is E-Permanent Lok Adalat (E-PLA) and how does it work?',
    a: 'E-PLA is a fast-track statutory forum for resolving electricity billing, metering, or tariff disputes amicably out of court. You can download the E-PLA case filing form from our portal and submit your dispute for scheduled conciliation.',
  },
  {
    q: 'How do I protect myself from cyber fraud and fake electricity bill SMS?',
    a: 'Beware of fake SMS/WhatsApp messages warning about immediate power disconnection. BSES NEVER asks consumers to pay via personal UPI IDs or download third-party APK files. Always make payments exclusively through our official portal or 19123 helpline.',
  },
  {
    q: 'What documents are mandatory for new connection applications?',
    a: 'You need an Identity Proof (Aadhaar Card, Voter ID, or PAN) and a Property Ownership / Tenancy Proof (Sale Deed, Rent Agreement, or Property Tax Receipt) in PDF, JPEG, or PNG format (max 10MB each).',
  },
  {
    q: 'Is my personal Aadhaar and mobile data secure on this portal?',
    a: 'Yes. All personal identity fields are encrypted using 256-bit AES encryption under DPDP Act 2023 compliance guidelines. Documents are stored in an isolated MongoDB GridFS vault.',
  },
];

export default function HelpCenterPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />

      <main className="flex-1 py-10 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8 w-full">
        {/* Header */}
        <div className="space-y-3 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3.5 py-1 text-xs font-bold text-amber-700 border border-amber-500/20">
            <HelpCircle className="h-4 w-4 text-amber-600" />
            <span>Consumer Support Hub</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-heading">
            Help Center &amp; Frequently Asked Questions
          </h1>
          <p className="text-sm text-slate-500">
            Find quick answers to common questions about new connections, WhatsApp services, solar net-metering, EV chargers, and cyber safety.
          </p>
        </div>

        {/* Emergency Helplines & WhatsApp Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 24x7 Call Center */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500 text-slate-950 rounded-xl font-bold shrink-0">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">24x7 Toll Free</p>
                <p className="text-xl font-extrabold text-slate-900 font-heading">19123</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">Call for power outages, wire breaks, and transformer emergencies.</p>
          </div>

          {/* WhatsApp Business */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-600 text-white rounded-xl font-bold shrink-0">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">WhatsApp Business</p>
                <p className="text-xl font-extrabold text-slate-900 font-heading">8800919123</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">Send "Hi" to report complaints, get duplicate bills, or check status.</p>
          </div>

          {/* Streetlight & Emergency WhatsApp */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-surface-dark text-amber-400 rounded-xl font-bold shrink-0">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Streetlight / Emergency</p>
                <p className="text-base font-extrabold text-slate-900 font-heading">011-49516707</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">Dedicated emergency helpline for streetlight &amp; safety hazards.</p>
          </div>
        </div>

        {/* Cyber Safety Warning Banner */}
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 text-xs text-amber-900 space-y-2 shadow-sm">
          <div className="flex items-center gap-2 font-extrabold text-amber-950 uppercase tracking-wide text-sm font-heading">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <span>Official BSES Cyber Safety Advisory</span>
          </div>
          <p className="leading-relaxed text-amber-800">
            <strong>Prevent Cyber Fraud:</strong> Beware of fraudulent SMS or WhatsApp messages claiming your electricity connection will be disconnected. BSES staff never request payments into personal accounts, nor do we send APK download links. All official payments must be made strictly on our verified portal.
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 font-heading">
            Frequently Asked Questions
          </h2>

          <FaqAccordion faqs={faqs} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
