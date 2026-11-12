import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public routes that don't require authentication
const publicRoutes = ["/", "/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static files (robots.txt, icons, the web manifest): no auth or nonce, but the same
  // headers, with a policy that lets them run nothing.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") // static files like favicon.ico
  ) {
    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    setCommonHeaders(res.headers);
    return res;
  }

  // Get auth token from cookies
  const authToken = request.cookies.get("auth_token")?.value;
  const userRole = request.cookies.get("user_role")?.value;

  // Check if current route is public
  const isPublicRoute = publicRoutes.includes(pathname);

  // If not authenticated and trying to access protected route
  if (!authToken && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If authenticated and trying to access login page
  if (authToken && pathname === "/login") {
    // Redirect to appropriate dashboard based on role
    const dashboardPath = getDashboardPath(userRole);
    return NextResponse.redirect(new URL(dashboardPath, request.url));
  }

  // Role-based route protection (server-side check)
  // Client-side layouts provide additional protection
  if (authToken && userRole) {
    // Check if user is trying to access routes they shouldn't
    if (pathname.startsWith("/admin") && userRole !== "super-admin") {
      return NextResponse.redirect(
        new URL(getDashboardPath(userRole), request.url)
      );
    }
    if (pathname.startsWith("/office") && userRole !== "office-user") {
      return NextResponse.redirect(
        new URL(getDashboardPath(userRole), request.url)
      );
    }
    if (pathname.startsWith("/client") && userRole !== "client") {
      return NextResponse.redirect(
        new URL(getDashboardPath(userRole), request.url)
      );
    }

    // Handle legacy route redirects
    if (pathname === "/dashboard") {
      return NextResponse.redirect(new URL("/office/dashboard", request.url));
    }
    if (pathname === "/client-portal") {
      return NextResponse.redirect(new URL("/client/dashboard", request.url));
    }
  }

  // Security headers. Scripts run only with this request's nonce (Next.js puts it on its own
  // scripts when it finds the policy on the request), so an injected <script> can't run.
  // 'strict-dynamic' lets those scripts load the app's chunks. Styles keep 'unsafe-inline':
  // React style attributes and the toast library need it, and CSS alone can't run code.
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  setCommonHeaders(response.headers);
  return response;
}

const dev = process.env.NODE_ENV !== "production";
// The API this build talks to (NEXT_PUBLIC_API_URL is fixed at build time). Always allowed,
// even on plain http, so a production build pointed at a local or test API can sign in.
const apiOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_API_URL || "").origin; } catch { return ""; }
})();

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    // Logos and profile pictures are data: URLs; PDFs preview from blob: URLs.
    "img-src 'self' data: blob:",
    "connect-src 'self'" + (apiOrigin ? ` ${apiOrigin}` : "") + (dev ? " http: ws:" : ""),
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join("; ");
}

function setCommonHeaders(h: Headers) {
  h.set("X-Frame-Options", "DENY");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  // HSTS only matters over HTTPS; browsers ignore it on http://localhost.
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

// Helper function to get dashboard path based on role
function getDashboardPath(role: string | undefined): string {
  switch (role) {
    case "super-admin":
      return "/admin/dashboard";
    case "office-user":
      return "/office/dashboard";
    case "client":
      return "/client/dashboard";
    default:
      return "/login";
  }
}

// Configure which routes use this middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
