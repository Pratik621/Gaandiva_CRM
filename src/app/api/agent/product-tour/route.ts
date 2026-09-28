import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert, TablesUpdate } from "@/types/database.types";

export const dynamic = "force-dynamic";

type UserSettingsRow = {
  product_tour_completed: boolean;
  product_tour_dismissed: boolean;
};

function isMissingTableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("user_settings") &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function toApiPrefs(row: UserSettingsRow | null) {
  return {
    tour_completed: row?.product_tour_completed ?? false,
    tour_dismissed: row?.product_tour_dismissed ?? false,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("user_settings")
      .select("product_tour_completed, product_tour_dismissed")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error.message)) {
        return NextResponse.json(toApiPrefs(null));
      }
      console.error("[product-tour] GET error:", error.message);
      return NextResponse.json({ error: "Failed to load tour preferences" }, { status: 500 });
    }

    return NextResponse.json(toApiPrefs(data as UserSettingsRow | null));
  } catch (err) {
    console.error("[product-tour] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      tour_completed?: boolean;
      tour_dismissed?: boolean;
    };

    const patch: Partial<UserSettingsRow> = {};
    if (typeof body.tour_completed === "boolean") {
      patch.product_tour_completed = body.tour_completed;
    }
    if (typeof body.tour_dismissed === "boolean") {
      patch.product_tour_dismissed = body.tour_dismissed;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data: existing, error: readError } = await supabase
      .from("user_settings")
      .select("product_tour_completed, product_tour_dismissed")
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError) {
      if (isMissingTableError(readError.message)) {
        return NextResponse.json(toApiPrefs(null));
      }
      console.error("[product-tour] PATCH read error:", readError.message);
      return NextResponse.json({ error: "Failed to update tour preferences" }, { status: 500 });
    }

    const current = existing as UserSettingsRow | null;
    const next: UserSettingsRow = {
      product_tour_completed:
        patch.product_tour_completed ?? current?.product_tour_completed ?? false,
      product_tour_dismissed:
        patch.product_tour_dismissed ?? current?.product_tour_dismissed ?? false,
    };

    if (current) {
      const updateRow: TablesUpdate<"user_settings"> = {
        product_tour_completed: next.product_tour_completed,
        product_tour_dismissed: next.product_tour_dismissed,
        updated_at: new Date().toISOString(),
      };
      const { error: updateError } = await supabase
        .from("user_settings")
        .update(updateRow as never)
        .eq("user_id", user.id);

      if (updateError) {
        if (isMissingTableError(updateError.message)) {
          return NextResponse.json(toApiPrefs(null));
        }
        console.error("[product-tour] PATCH update error:", updateError.message);
        return NextResponse.json({ error: "Failed to update tour preferences" }, { status: 500 });
      }
    } else {
      const insertRow: TablesInsert<"user_settings"> = {
        user_id: user.id,
        product_tour_completed: next.product_tour_completed,
        product_tour_dismissed: next.product_tour_dismissed,
        updated_at: new Date().toISOString(),
      };
      const { error: insertError } = await supabase
        .from("user_settings")
        .insert(insertRow as never);

      if (insertError) {
        if (isMissingTableError(insertError.message)) {
          return NextResponse.json(toApiPrefs(null));
        }
        console.error("[product-tour] PATCH insert error:", insertError.message);
        return NextResponse.json({ error: "Failed to update tour preferences" }, { status: 500 });
      }
    }

    return NextResponse.json(toApiPrefs(next));
  } catch (err) {
    console.error("[product-tour] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
