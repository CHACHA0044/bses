'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  Zap,
  ShieldCheck,
  FileCheck,
  ArrowRight,
  UserPlus,
  LogIn,
  Phone,
  ChevronDown,
  FileText,
  UploadCloud,
  CheckCircle2,
  HelpCircle,
  Building2,
  Clock,
} from 'lucide-react';

const keyServices = [
  {
    icon: Zap,
    title: 'New Electricity Connection',
    description: 'Apply for residential, commercial, or industrial power supply — fully online in 4 steps.',
    href: '/register',
    accent: 'bg-primary text-white',
  },
  {
    icon: FileCheck,
    title: 'Track Application Status',
    description: 'Monitor real-time progress from document submission to meter installation.',
    href: '/login',
    accent: 'bg-surface-dark text-white',
  },
  {
    icon: ShieldCheck,
    title: 'DPDP Data Vault',
    description: 'AES-256 encrypted PII and MongoDB GridFS secure document vault.',
    href: '/dpdp-act',
    accent: 'bg-emerald-600 text-white',
  },
  {
    icon: Phone,
    title: '24×7 Helpline & Support',
    description: 'Report power outages or emergencies via toll-free 19123 anytime.',
    href: '/help-center',
    accent: 'bg-amber-500 text-slate-950',
  },
];

const journeySteps = [
  {
    n: '01',
    title: 'Create Consumer Account',
    desc: 'Register your consumer profile with 10-digit mobile number and email verification.',
    icon: UserPlus,
    accent: 'bg-amber-500 text-slate-950',
    ring: 'border-amber-300',
  },
  {
    n: '02',
    title: 'Fill Connection Form',
    desc: 'Specify property address, load requirements (kW), and tariff category.',
    icon: FileText,
    accent: 'bg-blue-600 text-white',
    ring: 'border-blue-300',
  },
  {
    n: '03',
    title: 'Upload Verified Proofs',
    desc: 'Upload ID and property ownership proof documents into our GridFS storage vault.',
    icon: UploadCloud,
    accent: 'bg-purple-600 text-white',
    ring: 'border-purple-300',
  },
  {
    n: '04',
    title: 'Inspection & Meter Install',
    desc: 'BSES field team verifies premises and completes meter installation within 48h.',
    icon: CheckCircle2,
    accent: 'bg-emerald-600 text-white',
    ring: 'border-emerald-300',
  },
];

const faqs = [
  {
    icon: Clock,
    q: 'How long does new connection approval take?',
    a: 'Standard domestic connections are approved within 24–48 hours after document verification and technical site inspection by BSES engineers.',
    category: 'Timeline',
    accent: 'bg-amber-500/10 text-amber-700 border-amber-200',
  },
  {
    icon: FileText,
    q: 'Can I save my application as a draft and resume later?',
    a: 'Yes. Your connection application auto-saves at each step as a draft in your consumer dashboard. You can resume anytime from any device.',
    category: 'Drafts',
    accent: 'bg-blue-500/10 text-blue-700 border-blue-200',
  },
  {
    icon: ShieldCheck,
    q: 'How is my Aadhaar and mobile data protected?',
    a: 'All PII fields are encrypted with 256-bit AES-CBC. Uploaded files are stored in an isolated MongoDB GridFS vault with strict access controls under DPDP Act 2023.',
    category: 'Security',
    accent: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  },
  {
    icon: Building2,
    q: 'Who can apply for a commercial electricity connection?',
    a: 'Any registered consumer with valid commercial property ownership or lease deed documents can apply for commercial power supply online.',
    category: 'Eligibility',
    accent: 'bg-purple-500/10 text-purple-700 border-purple-200',
  },
];

export default function HomeMotionContent() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      {/* ── 1. Hero — full viewport height ── */}
      <section className="relative flex min-h-[calc(100vh-4rem)] w-full items-center bses-gradient-hero overflow-hidden">
        {/* Subtle grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
        <div className="pointer-events-none absolute -right-40 -top-40 h-[600px] w-[600px] rounded-full bg-amber-500/10 blur-3xl" />

        <div className="page-container relative z-10 grid grid-cols-1 gap-12 py-16 lg:grid-cols-12 lg:gap-8 lg:py-24 items-center">
          {/* Left copy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="lg:col-span-7 space-y-6 text-center lg:text-left"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/15 px-4 py-1.5 text-xs font-bold text-amber-300">
              <Zap className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              Unofficial BSES Delhi Discom Portal — BRPL &amp; BYPL
            </span>

            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
              BSES Consumer<br />
              <span className="text-amber-400">Connection Portal</span>
            </h1>

            <p className="max-w-xl text-slate-300 text-base leading-relaxed mx-auto lg:mx-0">
              Apply for new electricity connections, upload verified PII documents under DPDP Act 2023, and track applications with real-time SMS &amp; WhatsApp alerts.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2 lg:justify-start">
              <Link href="/register">
                <Button variant="cta" size="lg" leftIcon={<UserPlus className="h-5 w-5" />}>
                  Register as Consumer
                </Button>
              </Link>
              <Link href="/login">
                <Button
                  variant="secondary"
                  size="lg"
                  className="!bg-white/10 !text-white !border-white/30 hover:!bg-white/20"
                  leftIcon={<LogIn className="h-5 w-5" />}
                >
                  Consumer Login
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Right — Quick Action Desk */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
            className="lg:col-span-5"
          >
            <div className="glass-panel-dark rounded-3xl p-6 sm:p-8 space-y-6 text-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h2 className="font-heading text-base font-bold">Instant Service Desk</h2>
                <span className="rounded-full border border-amber-400/30 bg-amber-500/20 px-3 py-0.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                  24×7 Live
                </span>
              </div>

              <div className="space-y-3">
                {[
                  {
                    icon: Zap,
                    color: 'bg-primary',
                    title: 'Apply for New Connection',
                    desc: 'Residential, commercial, or industrial in 4 easy steps.',
                    href: '/register',
                  },
                  {
                    icon: FileCheck,
                    color: 'bg-slate-800',
                    title: 'Track Application Timeline',
                    desc: 'Live status from submission to meter installation.',
                    href: '/login',
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.title}
                      href={item.href}
                      className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-amber-400/50 hover:bg-white/10"
                    >
                      <div className={`shrink-0 rounded-xl p-3 ${item.color} text-white`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-300 mt-0.5">{item.desc}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  DPDP Act 2023 Compliant
                </span>
                <span className="font-bold text-amber-300">Toll Free: 19123</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── 2. Emergency Bar ── */}
      <div className="w-full bg-amber-500 px-4 py-3 text-center text-xs font-bold text-slate-950 sm:flex sm:items-center sm:justify-between sm:px-8">
        <span className="flex items-center justify-center gap-2">
          <Phone className="h-4 w-4" />
          24×7 BSES Emergency Helpline: <strong>19123</strong>
        </span>
        <Link href="/help-center" className="underline hover:text-slate-800 transition">
          Visit Help Center →
        </Link>
      </div>

      {/* ── 3. Key Services Cards ── */}
      <section className="section-gap page-container w-full space-y-10">
        <div className="text-center space-y-2">
          <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">
            Key Electricity Consumer Services
          </h2>
          <p className="text-sm text-slate-500">
            Streamlined digital services for 4.8M+ BSES consumers in Delhi.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {keyServices.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <Card hoverable className="flex flex-col gap-4 p-6 h-full border border-slate-200">
                  <div
                    className={`h-12 w-12 rounded-xl flex items-center justify-center ${s.accent} shadow-sm`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-heading font-bold text-slate-900 text-base">{s.title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{s.description}</p>
                  </div>
                  <Link
                    href={s.href}
                    className="mt-auto inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline pt-2"
                  >
                    Access Service <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── 4. Lively & Flowy 4 Easy Steps Journey ── */}
      <section className="w-full border-y border-slate-200/80 bg-slate-100/80 py-16 lg:py-20 relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-[800px] rounded-full bg-primary/5 blur-3xl" />

        <div className="page-container space-y-12 relative z-10">
          <div className="text-center space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-1 text-xs font-bold text-primary border border-primary/20">
              <Zap className="h-3.5 w-3.5" />
              Seamless Digital Workflow
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              New Connection — <span className="text-primary">4 Easy Steps</span>
            </h2>
            <p className="text-sm text-slate-500 max-w-lg mx-auto">
              From online registration to physical meter installation in under 48 hours.
            </p>
          </div>

          <div className="relative">
            <div className="hidden lg:block absolute top-1/2 left-12 right-12 h-1 bg-gradient-to-r from-amber-400 via-blue-500 via-purple-500 to-emerald-500 -translate-y-1/2 rounded-full opacity-30" />

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8 xl:gap-10 relative">
              {journeySteps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div
                    key={step.n}
                    initial={{ opacity: 0, y: 25 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: i * 0.12 }}
                    className="group relative flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-lg hover:border-primary/30 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-heading text-3xl font-extrabold text-slate-300 group-hover:text-primary transition-colors">
                        {step.n}
                      </span>
                      <div className={`p-3 rounded-2xl ${step.accent} shadow-md transition-transform duration-300`}>
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <h3 className="font-heading font-extrabold text-slate-900 text-base group-hover:text-primary transition-colors">
                        {step.title}
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {step.desc}
                      </p>
                    </div>

                    <div className="mt-auto pt-3 border-t border-slate-100 flex items-center text-[11px] font-bold text-slate-400">
                      <span>Step {i + 1} of 4</span>
                    </div>

                    {i < journeySteps.length - 1 && (
                      <div className="hidden lg:flex absolute -right-5 xl:-right-6 top-1/2 -translate-y-1/2 z-20 items-center justify-center h-9 w-9 rounded-full bg-white border border-slate-200 shadow-md text-slate-400 transition-colors duration-300 pointer-events-none">
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Upgraded Interactive FAQ Accordion Cards ── */}
      <section className="py-20 w-full bg-slate-50">
        <div className="page-container max-w-4xl space-y-10">
          <div className="text-center space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3.5 py-1 text-xs font-bold text-amber-700 border border-amber-500/20">
              <HelpCircle className="h-4 w-4 text-amber-600" />
              <span>Help &amp; Support Hub</span>
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Quick answers about new connection applications, document upload, and DPDP 2023 compliance.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => {
              const Icon = faq.icon;
              const isOpen = openFaq === i;
              return (
                <motion.div
                  key={faq.q}
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: i * 0.08 }}
                  className={`rounded-3xl border transition-all duration-200 overflow-hidden ${
                    isOpen
                      ? 'border-primary/40 bg-white shadow-lg ring-2 ring-primary/10'
                      : 'border-slate-200/90 bg-white shadow-sm hover:border-slate-300 hover:shadow-md'
                  }`}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="no-scale flex w-full items-center justify-between gap-4 p-5 sm:p-6 text-left font-bold text-slate-900 focus:outline-none"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className={`p-2.5 rounded-2xl border ${faq.accent} shrink-0`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold font-heading uppercase tracking-wider text-slate-400 block">
                          {faq.category}
                        </span>
                        <span className="font-heading font-extrabold text-base sm:text-lg text-slate-900">
                          {faq.q}
                        </span>
                      </div>
                    </div>

                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                        isOpen
                          ? 'bg-primary text-white border-primary rotate-180 shadow-sm'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </div>
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 sm:px-6 pb-6 pt-1 text-sm text-slate-600 leading-relaxed border-t border-slate-100/80">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

          <div className="pt-2 text-center">
            <Link
              href="/help-center"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-xs font-bold text-slate-700 shadow-sm hover:border-primary hover:text-primary hover:shadow-md transition-all"
            >
              <HelpCircle className="h-4 w-4 text-primary" />
              <span>Explore Full Help Center &amp; FAQs</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
