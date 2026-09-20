import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/calendar-oauth/app-url";

export async function GET(request: Request) {
  const baseUrl = getAppBaseUrl(request);
  return NextResponse.redirect(`${baseUrl}/calendar`);
}
