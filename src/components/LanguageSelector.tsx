import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Globe, ChevronDown, Check } from 'lucide-react';

interface LanguageSelectorProps {
  variant?: 'light' | 'dark';
  compact?: boolean;
  idPrefix?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  variant = 'light',
  compact = false,
  idPrefix = 'lang',
}) => {
  const { language, setLanguage, languages, currentLanguageOption } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const isDark = variant === 'dark';

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        id={`${idPrefix}-selector-btn`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer shadow-2xs ${
          isDark
            ? 'bg-[#334155] hover:bg-[#475569] text-white border border-[#475569]'
            : 'bg-white hover:bg-[#eff4ff] text-[#0b1c30] border border-[#cbd5e1]'
        }`}
        title="Change language / भाषा बदलें / భాషను మార్చండి"
      >
        <Globe
          className={`w-3.5 h-3.5 ${
            isDark ? 'text-[#7ffc97]' : 'text-[#006b2c]'
          }`}
        />
        <span className={compact ? 'hidden sm:inline' : 'inline'}>
          {currentLanguageOption.nativeName}
        </span>
        <span className={compact ? 'inline sm:hidden uppercase font-mono' : 'hidden'}>
          {currentLanguageOption.shortLabel}
        </span>
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-[#006b2c]' : isDark ? 'text-[#94a3b8]' : 'text-[#64748b]'
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          id={`${idPrefix}-dropdown-menu`}
          className="absolute right-0 mt-1.5 w-44 rounded-xl bg-white shadow-xl border border-[#e2e8f0] py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#64748b] border-b border-[#f1f5f9] mb-1">
            Language / भाषा / భాష
          </div>
          {languages.map((item) => {
            const isSelected = item.code === language;
            return (
              <button
                key={item.code}
                role="option"
                aria-selected={isSelected}
                id={`${idPrefix}-option-${item.code}`}
                type="button"
                onClick={() => {
                  setLanguage(item.code);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-[12px] transition-colors text-left cursor-pointer ${
                  isSelected
                    ? 'bg-[#eff4ff] text-[#006b2c] font-bold'
                    : 'text-[#0b1c30] hover:bg-[#f8fafc]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px]">{item.nativeName}</span>
                  {item.code !== 'en' && (
                    <span className="text-[10px] text-[#64748b]">({item.name})</span>
                  )}
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-[#006b2c] stroke-[2.5]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
