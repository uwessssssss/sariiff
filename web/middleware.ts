import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public routes that don't require authentication
const publicRoutes = ["/", "/login"];

// Role-based route prefixes
const roleRoutes = {
  "super-admin": "/admin",
  "office-user": "/office",
  client: "/client",
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files and API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") // static files like favicon.ico
  ) {
    return NextResponse.next();
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

  // Add security headers
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  // HSTS only matters over HTTPS; browsers ignore it on http://localhost.
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Scripts only from this site (Next.js still needs inline bootstrap scripts;
  // a nonce-based policy would remove 'unsafe-inline' later). The API, fonts and
  // WhatsApp links are allowed; plugins, <base> hijacking and framing are not.
  const dev = process.env.NODE_ENV !== "production";
  // The API this build talks to is always allowed, even on plain http (a local or test
  // API); without it a production build pointed at http://127.0.0.1 could not sign in.
  let apiOrigin = "";
  try { apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || "").origin; } catch { /* unset */ }
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https: wss:" + (dev ? " http: ws:" : "") + (apiOrigin ? ` ${apiOrigin}` : ""),
      "frame-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
    ].join("; "),
  );

  return response;
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
