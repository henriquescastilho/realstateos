import { type NextRequest, NextResponse } from "next/server";

/**
 * Protected route middleware.
 *
 * Auth state lives in localStorage (client-side), which isn't accessible
 * in Edge middleware. We use a lightweight httpOnly cookie (`ro_auth`) set
 * by the login page after a successful auth response to signal auth state
 * to the middleware.
 *
 * Flow:
 *   1. Login page → POST /auth/login → on success: set cookie `ro_auth=1`
 *   2. Middleware → if no `ro_auth` cookie on protected path → redirect /login
 *   3. Logout → clear cookie → redirect /login
 */

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const isAuthed = Boolean(request.cookies.get("ro_auth")?.value);

  // Redirect unauthenticated users to login
  if (!isPublicPath(pathname) && !isAuthed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Redirect already-authed users away from auth pages
  if (isPublicPath(pathname) && isAuthed) {
    const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
    const url = request.nextUrl.clone();
    url.pathname = next;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files, images, and api routes.
     * https://nextjs.org/docs/app/building-your-application/routing/middleware
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
