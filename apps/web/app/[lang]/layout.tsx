import { notFound } from 'next/navigation';
import { DEFAULT_LANGUAGE } from '@futuremode/shared/constants';

const SUPPORTED_LOCALES = ['zh-TW'] as const;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ lang: locale }));
}

interface Props {
  children: React.ReactNode;
  params: { lang: string };
}

export default function LocaleLayout({ children, params }: Props) {
  if (!SUPPORTED_LOCALES.includes(params.lang as (typeof SUPPORTED_LOCALES)[number])) {
    notFound();
  }
  return <div data-locale={params.lang}>{children}</div>;
}

export async function generateMetadata({ params }: { params: { lang: string } }) {
  if (params.lang === DEFAULT_LANGUAGE) {
    return {
      title: 'futuremode2026',
      description: 'Google Meet 風格 + 即時 AI 助手會議系統',
    };
  }
  return { title: 'futuremode2026' };
}
