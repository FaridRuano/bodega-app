import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { canAccessPath } from "@libs/access";

export default auth((req) => {
  const user = req.auth?.user;
  const { pathname } = req.nextUrl;

  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (pathname.startsWith("/dashboard")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (!canAccessPath(user.role, pathname)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/login", "/dashboard/:path*"],
};
