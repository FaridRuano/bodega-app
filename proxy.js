import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const user = req.auth?.user;
  const { pathname } = req.nextUrl;

  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/login", "/dashboard/:path*"],
};