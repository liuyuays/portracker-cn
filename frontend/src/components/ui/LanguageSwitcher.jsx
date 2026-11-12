import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ className }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || 'en';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('gap-2 text-slate-600 dark:text-slate-300', className)} aria-label={t('Change language')} title={t('Change language')}>
          <Languages className="h-4 w-4" aria-hidden="true" />
          <span lang={language}>{language === 'zh-CN' ? '简体中文' : 'English'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup value={language} onValueChange={next => void i18n.changeLanguage(next)} aria-label={t('Language')}>
          <DropdownMenuRadioItem value="en" lang="en">English</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="zh-CN" lang="zh-CN">简体中文</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
