import { NextResponse, type NextRequest } from "next/server";
import {
  buildLoginRedirectPath,
  canAccessPath,
  getDefaultRedirectPath,
  isDeviceAuthPath,
  isMfaAuthPath,
  isProtectedPath,
  isPublicPath,
  normalizeRoleNames,
} from "@/lib/auth/config";
import { resolveMfaMiddlewareRedirect } from "@/lib/mfa/middleware-gate";
import { resolveDeviceMiddlewareRedirect } from "@/lib/devices/middleware-gate";
import {
  NETWORK_BLOCKED_PATH,
  evaluateNetworkGate,
} from "@/lib/network/middleware-gate";
import { isPureAgent } from "@/lib/network/settings";
import { setDeviceOkCookie } from "@/lib/devices/cookie";
import { authDebug } from "@/lib/auth/debug";
import { createMiddlewareSupabaseClient } from "@/lib/supabase/middleware";

const CANONICAL_PRODUCTION_HOST = "www.simplifiedmarketplace.com";

const DEVICE_SENSITIVE_PREFIXES = [
  "/admin/devices",
  "/admin/users",
  "/admin/roles",
  "/admin/settings",
  "/admin-support/devices",
  "/admin-support/users",
  "/admin-support/settings",
];

function isDeviceSensitivePath(pathname: string) {
  return DEVICE_SENSITIVE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function appendSetCookieHeaders(from: NextResponse, to: NextResponse) {
  from.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      to.headers.append(key, value);
    }
  });

  return to;
}

function redirectWithCookies(request: NextRequest, response: NextResponse, pathname: string) {
  const targetUrl = new URL(pathname, request.url);
  const redirect = NextResponse.redirect(targetUrl);
  return appendSetCookieHeaders(response, redirect);
}

function maybeRedirectToCanonicalHost(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  const host = request.headers.get("host")?.toLowerCase();
  if (host !== "simplifiedmarketplace.com") {
    return null;
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.host = CANONICAL_PRODUCTION_HOST;
  redirectUrl.protocol = "https:";
  return NextResponse.redirect(redirectUrl, 308);
}

async function getUserRoleNames(
  supabase: NonNullable<ReturnType<typeof createMiddlewareSupabaseClient>["supabase"]>,
  userId: string
) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return normalizeRoleNames(
    (data ?? []).map((row: { roles: { name: string } | null }) => row.roles?.name)
  );
}

async function getUserOrgId(
  supabase: NonNullable<ReturnType<typeof createMiddlewareSupabaseClient>["supabase"]>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", userId)
    .single();
  return (data as { organization_id: string | null } | null)?.organization_id ?? null;
}

export async function middleware(request: NextRequest) {
  const canonicalRedirect = maybeRedirectToCanonicalHost(request);
  if (canonicalRedirect) return canonicalRedirect;

  const pathname = request.nextUrl.pathname;
  const currentSearch = request.nextUrl.search;

  const { supabase, getResponse } = createMiddlewareSupabaseClient(request);

  let response = getResponse();

  if (!supabase) {
    return response;
  }

  let user: { id: string } | null = null;
  let jwtClaims: Record<string, unknown> | null = null;
  // Roles embedded in the JWT by the custom_access_token_hook. Null means the
  // claim is absent (hook disabled or pre-hook token) — fall back to the DB.
  let claimRoles: string[] | null = null;

  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims as
      | (Record<string, unknown> & { sub?: string })
      | null
      | undefined;

    if (!error && claims?.sub) {
      user = { id: claims.sub };
      jwtClaims = claims;
      const rawRoles = claims["app_roles"];
      if (Array.isArray(rawRoles)) {
        claimRoles = rawRoles.filter((r): r is string => typeof r === "string");
      }
    }

    // Refresh cookies ONLY ONCE
    response = getResponse();
  } catch (err) {
    console.warn("[middleware] auth failed:", err);
  }

  // Agent API requests: office-network gate only (a live session outside the
  // office must lose data access too, not just page navigation). Other gates
  // stay page-level — their redirects don't make sense for fetch responses.
  if (pathname.startsWith("/api/agent")) {
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      const roleNames =
        claimRoles && claimRoles.length > 0
          ? normalizeRoleNames(claimRoles)
          : await getUserRoleNames(supabase, user.id);
      if (!isPureAgent(roleNames)) {
        return response;
      }
      const orgId = await getUserOrgId(supabase, user.id);
      const gate = await evaluateNetworkGate(request, supabase, user.id, roleNames, orgId);
      if (gate.blocked) {
        return NextResponse.json(
          {
            error: "Gaandiva can only be accessed from the office network.",
            code: "network_blocked",
          },
          { status: 403 }
        );
      }
    } catch (err) {
      console.warn("[middleware] agent API network gate failed:", err);
    }
    return response;
  }

  // Allow public routes
  if (isPublicPath(pathname)) {
    return response;
  }

  // Protected route + no user → login
  if (isProtectedPath(pathname) && !user) {
    const loginPath = buildLoginRedirectPath(pathname, currentSearch);

    authDebug("middleware", "redirect anonymous protected route", {
      pathname,
      loginPath,
    });

    return redirectWithCookies(request, response, loginPath);
  }

  if (user) {
    // MFA gate (org feature flag + grace period) — before role routing.
    if (!isMfaAuthPath(pathname) && !isDeviceAuthPath(pathname) && isProtectedPath(pathname)) {
      try {
        const mfaRedirect = await resolveMfaMiddlewareRedirect(
          request,
          supabase,
          user.id,
          jwtClaims ?? undefined
        );
        if (mfaRedirect && pathname !== mfaRedirect) {
          authDebug("middleware", "redirect MFA gate", {
            userId: user.id,
            mfaRedirect,
          });
          return redirectWithCookies(request, response, mfaRedirect);
        }
      } catch (err) {
        console.warn("[middleware] MFA gate failed:", err);
      }
    }

    // Device whitelist gate — after MFA, before role routing.
    if (!isMfaAuthPath(pathname) && !isDeviceAuthPath(pathname) && isProtectedPath(pathname)) {
      try {
        const deviceResult = await resolveDeviceMiddlewareRedirect(
          request,
          supabase,
          user.id,
          { forceRecheck: isDeviceSensitivePath(pathname) }
        );
        if (deviceResult.redirect && pathname !== deviceResult.redirect) {
          authDebug("middleware", "redirect device gate", {
            userId: user.id,
            deviceRedirect: deviceResult.redirect,
          });
          return redirectWithCookies(request, response, deviceResult.redirect);
        }
        if (deviceResult.refreshOkCookie) {
          setDeviceOkCookie(response, user.id, deviceResult.refreshOkCookie.deviceId);
        }
      } catch (err) {
        console.warn("[middleware] device gate failed:", err);
      }
    }

    // Only resolve roles when we actually need a role-based redirect.
    // For /dashboard/* and other role-gated prefixes we still need the check.
    const isRoleGatedPath =
      pathname === "/" ||
      pathname === "/dashboard" ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/admin-support") ||
      pathname.startsWith("/agent") ||
      pathname.startsWith("/tl") ||
      pathname.startsWith("/stl") ||
      pathname.startsWith("/sales") ||
      pathname.startsWith("/qa") ||
      pathname.startsWith("/mis") ||
      pathname.startsWith("/mistl") ||
      pathname.startsWith("/qatl") ||
      pathname.startsWith("/dc") ||
      pathname.startsWith("/emm");

    if (isRoleGatedPath) {
      try {
        // JWT claim first (no DB round-trip); DB fallback covers tokens issued
        // before the hook was enabled and users with an empty claim.
        const roleNames =
          claimRoles && claimRoles.length > 0
            ? normalizeRoleNames(claimRoles)
            : await getUserRoleNames(supabase, user.id);

        // Office-network gate — pure-agent accounts only, every navigation.
        // Role check first so non-agents never pay the org lookup.
        if (pathname !== NETWORK_BLOCKED_PATH && isPureAgent(roleNames)) {
          const orgId = await getUserOrgId(supabase, user.id);
          const gate = await evaluateNetworkGate(request, supabase, user.id, roleNames, orgId);
          if (gate.blocked) {
            authDebug("middleware", "redirect network gate", {
              userId: user.id,
              pathname,
            });
            return redirectWithCookies(request, response, NETWORK_BLOCKED_PATH);
          }
        }

        // Root/dashboard redirect
        if (pathname === "/" || pathname === "/dashboard") {
          const redirectPath = getDefaultRedirectPath(roleNames);

          authDebug("middleware", "redirect root/dashboard", {
            userId: user.id,
            redirectPath,
          });

          return redirectWithCookies(request, response, redirectPath);
        }

        // Unauthorized route
        if (!canAccessPath(pathname, roleNames)) {
          const fallbackPath = getDefaultRedirectPath(roleNames);

          authDebug("middleware", "redirect unauthorized", {
            userId: user.id,
            pathname,
            fallbackPath,
          });

          return redirectWithCookies(request, response, fallbackPath);
        }
      } catch (err) {
        console.warn("[middleware] role fetch failed:", err);
      }
    }
  }

  return response;
}

export const config = {

  matcher: [
  "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  // Agent data APIs go through the office-network gate (live sessions must
  // lose access mid-session, not just on page navigation).
  "/api/agent/:path*",
],
};
