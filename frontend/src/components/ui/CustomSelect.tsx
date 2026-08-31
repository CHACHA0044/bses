'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface CustomSelectProps {
  id?: string;
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hasError?: boolean;
  disabled?: boolean;
  className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  id,
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  hasError,
  disabled,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger — full-width clickable bar */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        style={{ WebkitTapHighlightColor: 'transparent' }}
        className={[
          'no-scale relative w-full cursor-pointer rounded-xl border px-3.5 py-2.5 pr-10 text-left text-sm',
          'bg-white/80 outline-none',
          'transition-[border-color,box-shadow] duration-150',
          'focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary',
          selectedOption ? 'text-slate-900 font-medium' : 'text-slate-400',
          hasError
            ? 'border-error focus-visible:ring-error/30 focus-visible:border-error'
            : isOpen
            ? 'border-primary ring-2 ring-primary/30'
            : 'border-slate-300 hover:border-slate-400',
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-100' : '',
        ].join(' ')}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="block truncate select-none">
          {selectedOption ? selectedOption.label : placeholder}
        </span>

        {/* Chevron — CSS smooth 180deg rotation */}
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5">
          <span className={`flex items-center justify-center text-slate-400 transition-transform duration-200 ease-in-out ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </span>
        </span>
      </button>

      {/* Dropdown list — CSS transition (no scale: fades/slides subtly) */}
      {isOpen && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={[
                  'relative flex cursor-pointer select-none items-center justify-between px-3.5 py-2.5 text-sm',
                  'transition-colors duration-100',
                  isSelected
                    ? 'bg-primary/10 font-bold text-primary hover:bg-primary/15 active:bg-primary/20'
                    : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200',
                ].join(' ')}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && (
                  <Check className="h-4 w-4 text-primary shrink-0 ml-2" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
