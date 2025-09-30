import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // In production, block access to non-daily game modes
  if (process.env.NODE_ENV === 'production') {
    if (pathname.startsWith('/planned-daily')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    
    // Block standalone intro page (should only be accessed through daily flow)
    if (pathname === '/intro') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    
    // Block direct access to /end page without game data
    if (pathname === '/end') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    
    // Block analytics dashboard in production
    if (pathname.startsWith('/analytics')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/planned-daily/:path*',
    '/intro',
    '/end',
    '/analytics/:path*'
  ]
};
