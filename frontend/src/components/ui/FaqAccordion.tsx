'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FaqItem {
  q: string;
  a: string;
}

export const FaqAccordion: React.FC<{ faqs: FaqItem[] }> = ({ faqs }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="divide-y divide-slate-100">
      {faqs.map((faq, idx) => {
        const isOpen = openFaq === idx;
        return (
          <div key={faq.q} className="py-4">
            <button
              onClick={() => setOpenFaq(isOpen ? null : idx)}
              className="w-full flex items-center justify-between text-left font-bold text-slate-900 text-sm hover:text-primary transition-colors gap-4"
              aria-expanded={isOpen}
            >
              <span>{faq.q}</span>
              {isOpen ? (
                <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
              ) : (
                <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
              )}
            </button>
            {isOpen && (
              <p className="mt-2 text-xs text-slate-600 leading-relaxed animate-in fade-in duration-150">
                {faq.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};
