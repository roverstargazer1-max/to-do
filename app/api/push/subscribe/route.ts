import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { subscription } = await request.json().catch(() => ({}));
    if (!subscription?.endpoint) {
      return NextResponse.json(
        { error: "Subscription endpoint is required" },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Internal Server Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  return NextResponse.json({ success: true });
}
