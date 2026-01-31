import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./src/lib/supabase/middleware";

const PUBLIC_PATHS = new Set(["/", "/login", "/register", "/setup"]);

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname);
}

function isAssetPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$/.test(pathname)
  );
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isAssetPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/:path*"],
};
