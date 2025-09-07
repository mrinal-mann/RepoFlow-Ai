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
  ];
  return publicPaths.some((pattern) => {
    const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
    return regex.test(path);
  });
};

export default clerkMiddleware(async (authFn, req) => {
  const { pathname, searchParams } = req.nextUrl;
  const auth = await authFn();
  const { userId } = auth;

  // Prevent infinite redirect loops by ensuring we don't redirect to the same page
  const redirectUrl = searchParams.get("redirect_url");
  if (redirectUrl && new URL(redirectUrl).pathname === pathname) {
    return NextResponse.next();
  }

  // Allow users to complete sign-up process and sync
  if (
    pathname.startsWith("/sign-up") ||
    pathname === "/sync-user" ||
    pathname === "/api/sync-user"
  ) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to /sign-in
  if (!userId && !isPublicRoute(pathname)) {
    const signInUrl = new URL("/sign-in", req.nextUrl.origin);
    if (!searchParams.has("redirect_url")) {
      signInUrl.searchParams.set("redirect_url", req.nextUrl.href);
    }
    return NextResponse.redirect(signInUrl);
  }

  // Redirect authenticated users from public pages to /create
  if (
    userId &&
    isPublicRoute(pathname) &&
    !pathname.startsWith("/sign-up") &&
    pathname !== "/sync-user" &&
    pathname !== "/api/sync-user"
  ) {
    return NextResponse.redirect(new URL("/create", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
