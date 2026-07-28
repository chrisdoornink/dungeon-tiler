import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * The dev harnesses (/test-*), /story, /stats and /endless are deliberately NOT
 * blocked here. They are not secret enough to be worth gating, and leaving them
 * reachable is what makes the traffic numbers meaningful — a redirect would
 * just hide whether anyone is actually finding them. Every request is tagged
 * with a `surface` property in PostHog instead (see lib/analytics_surface.ts),
 * so unexpected interest shows up as data rather than as silence.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /end renders the results of a run that lives in local storage. Reaching it
  // cold in production means there is nothing to show, so send those visitors
  // to the daily instead.
  if (process.env.NODE_ENV === 'production' && pathname === '/end') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/end'],
};
