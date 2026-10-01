import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/login", request.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
