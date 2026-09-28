import { NextResponse } from "next/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  passwordResetExpiresAt,
  sendPasswordResetEmail,
  PASSWORD_RESET_COOLDOWN_MS,
  PASSWORD_RESET_MAX_SENDS,
  PASSWORD_RESET_SEND_WINDOW_MS,
} from "@/lib/auth/password-reset";

export const dynamic = "force-dynamic";

const GENERIC_OK =
  "If an account exists for that email, we sent a password reset link. Check your inbox.";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Anti-enumeration: always return the same success message.
    const { data: profile } = await admin
      .from("users")
      .select("id, email, status")
      .ilike("email", email)
      .maybeSingle();

    const user = profile as { id: string; email: string | null; status: string } | null;

    if (!user || user.status === "inactive") {
      return NextResponse.json({ ok: true, message: GENERIC_OK });
    }

    const since = new Date(Date.now() - PASSWORD_RESET_SEND_WINDOW_MS).toISOString();
    const { data: recent } = await admin
      .from("password_reset_tokens")
      .select("created_at")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    const sends = (recent ?? []) as { created_at: string }[];
    if (sends.length >= PASSWORD_RESET_MAX_SENDS) {
      return NextResponse.json(
        {
          error: "Too many reset requests. Please try again later.",
          retryAfterMs: PASSWORD_RESET_SEND_WINDOW_MS,
        },
        { status: 429 }
      );
    }

    const last = sends[0]?.created_at;
    if (last) {
      const elapsed = Date.now() - new Date(last).getTime();
      if (elapsed < PASSWORD_RESET_COOLDOWN_MS) {
        return NextResponse.json(
          {
            error: "Please wait before requesting another reset email.",
            retryAfterMs: PASSWORD_RESET_COOLDOWN_MS - elapsed,
          },
          { status: 429 }
        );
      }
    }

    // Invalidate previous unused tokens
    await admin
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() } as never)
      .eq("user_id", user.id)
      .is("used_at", null);

    const token = generatePasswordResetToken();
    const { error: insertErr } = await admin.from("password_reset_tokens").insert({
      user_id: user.id,
      token_hash: hashPasswordResetToken(token),
      expires_at: passwordResetExpiresAt(),
    } as never);

    if (insertErr) {
      console.error("[forgot-password] insert failed:", insertErr.message);
      return NextResponse.json({ error: "Unable to start password reset." }, { status: 500 });
    }

    const sent = await sendPasswordResetEmail({
      to: user.email ?? email,
      token,
      origin: request.headers.get("origin"),
    });

    if (!sent.ok) {
      console.error("[forgot-password] send failed:", sent.error);
      // Still return generic OK to avoid leaking config/email existence details
      // but log for ops. Optionally return 503 if email is critical.
      return NextResponse.json(
        { error: "Unable to send reset email. Please try again later." },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, message: GENERIC_OK });
  } catch (err) {
    console.error("[forgot-password] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
