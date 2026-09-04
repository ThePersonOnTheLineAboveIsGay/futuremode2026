/**
 * Redirect root to default locale.
 * Multi-locale structure is ready for /en-US, /ja-JP etc. in Phase 6+.
 */
import { NextResponse, type NextRequest } from 'next/server';

const DEFAULT_LOCALE = 'zh-TW';
const SUPPORTED_LOCALES = ['zh-TW'] as const;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next.js internals and static files.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Already prefixed? leave alone.
  const hasLocalePrefix = SUPPORTED_LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocalePrefix) {
    return NextResponse.next();
  }

  // Redirect / to /zh-TW
  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
