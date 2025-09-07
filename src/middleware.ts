import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = (path: string) => {
  const publicPaths = [
    "/",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/api/razorpay/webhook",
    "/sync-user",
    "/api/sync-user",
    "/api/health", // Health check for monitoring
    "/robots.txt",
    "/sitemap.xml",
    "/favicon.ico",
  ];
  return publicPaths.some((pattern) => {
    const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
    return regex.test(path);
  });
};

export default clerkMiddleware(async (authFn, req) => {
  const { pathname, searchParams } = req.nextUrl;
  
  // 🔒 HTTPS Enforcement for Production
  if (process.env.NODE_ENV === 'production') {
    const proto = req.headers.get('x-forwarded-proto') || 
                  req.headers.get('x-forwarded-protocol') ||
                  (req.nextUrl.protocol === 'https:' ? 'https' : 'http');
    
    if (proto !== 'https') {
      console.log(`🔄 Redirecting to HTTPS: ${pathname}`);
      return NextResponse.redirect(
        `https://${req.headers.get('host')}${pathname}${req.nextUrl.search}`,
        301
      );
    }
  }

  // 🚨 Security Headers for Production
  const response = NextResponse.next();
  
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // 🎯 Skip auth for webhooks and static files
  if (pathname.startsWith('/api/razorpay/webhook') || 
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/api/health')) {
    return response;
  }

  try {
    const auth = await authFn();
    const { userId } = auth;

    // 🔄 Prevent infinite redirect loops
    const redirectUrl = searchParams.get("redirect_url");
    if (redirectUrl && new URL(redirectUrl).pathname === pathname) {
      return response;
    }

    // ✅ Allow public routes and sign-up flow
    if (isPublicRoute(pathname) || 
        pathname.startsWith("/sign-up") || 
        pathname === "/sync-user" || 
        pathname === "/api/sync-user") {
      return response;
    }

    // 🔐 Redirect unauthenticated users to sign-in
    if (!userId) {
      console.log(`🔐 Redirecting unauthenticated user from: ${pathname}`);
      const signInUrl = new URL("/sign-in", req.nextUrl.origin);
      
      if (!searchParams.has("redirect_url")) {
        signInUrl.searchParams.set("redirect_url", req.nextUrl.href);
      }
      
      return NextResponse.redirect(signInUrl);
    }

    // 🏠 Redirect authenticated users from home page to dashboard
    if (userId && pathname === "/" && !pathname.startsWith("/sign-up")) {
      console.log(`🏠 Redirecting authenticated user to dashboard`);
      return NextResponse.redirect(new URL("/create", req.nextUrl.origin));
    }

    return response;

  } catch (error) {
    console.error('❌ Middleware error:', error);
    
    // 🚨 Graceful error handling - don't break the app
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Authentication service temporarily unavailable' },
        { status: 503 }
      );
    }
    
    // For pages, redirect to error page or sign-in
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
  }
});

export const config = {
  matcher: [
    // Match all paths except static files and images
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Include all API routes and tRPC
    "/(api|trpc)(.*)",
  ],
};