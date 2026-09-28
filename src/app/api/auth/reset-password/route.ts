import { NextResponse } from "next/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import {
  hashPasswordResetToken,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth/password-reset";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      password?: string;
    };
    const token = body.token?.trim();
    const password = body.password ?? "";

    if (!token) {
      return NextResponse.json({ error: "Invalid or missing reset link." }, { status: 400 });
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const tokenHash = hashPasswordResetToken(token);
    const { data: row, error: fetchErr } = await admin
      .from("password_reset_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .maybeSingle();

    const reset = row as {
      id: string;
      user_id: string;
      expires_at: string;
      used_at: string | null;
    } | null;

    if (fetchErr || !reset) {
      return NextResponse.json(
        { error: "This reset link is invalid or has already been used." },
        { status: 400 }
      );
    }

    if (new Date(reset.expires_at).getTime() < Date.now()) {
      await admin
        .from("password_reset_tokens")
        .update({ used_at: new Date().toISOString() } as never)
        .eq("id", reset.id);
      return NextResponse.json(
        { error: "This reset link has expired. Please request a new one." },
        { status: 400 }
      );
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(reset.user_id, {
      password,
    });

    if (updateErr) {
      console.error("[reset-password] update failed:", updateErr.message);
      return NextResponse.json(
        { error: updateErr.message || "Failed to update password." },
        { status: 400 }
      );
    }

    await admin
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() } as never)
      .eq("id", reset.id);

    // Invalidate any other outstanding reset tokens for this user
    await admin
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() } as never)
      .eq("user_id", reset.user_id)
      .is("used_at", null);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reset-password] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
