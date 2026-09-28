import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ThreadRow = {
  id: string;
  organization_id: string;
  client_id: string;
  campaign_id: string;
};

export type ThreadAccessSuccess = {
  user: User;
  orgId: string;
  agentName: string;
  userClientId: string | null;
  thread: ThreadRow;
};

export type ThreadAccessError = {
  error: NextResponse;
};

export type ThreadAccessResult = ThreadAccessSuccess | ThreadAccessError;

type ChatAuthSuccess = {
  user: User;
  orgId: string;
  agentName: string;
  userClientId: string | null;
};

type ChatAuthResult = ChatAuthSuccess | ThreadAccessError;

export async function getChatAuth(supabase: Supabase): Promise<ChatAuthResult> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id, full_name, client_id")
    .eq("id", user.id)
    .single();

  const row = profile as {
    organization_id: string | null;
    full_name: string | null;
    client_id: string | null;
  } | null;

  const orgId = row?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }

  return {
    user,
    orgId,
    agentName: row?.full_name?.trim() || "You",
    userClientId: row?.client_id ?? null,
  };
}

export async function assertThreadAccess(
  supabase: Supabase,
  threadId: string
): Promise<ThreadAccessResult> {
  const auth = await getChatAuth(supabase);
  if ("error" in auth) return auth;

  const { data: thread, error } = await supabase
    .from("chat_threads")
    .select("id, organization_id, client_id, campaign_id")
    .eq("id", threadId)
    .single();

  if (error || !thread) {
    return { error: NextResponse.json({ error: "Thread not found" }, { status: 404 }) };
  }

  const t = thread as ThreadRow;

  if (t.organization_id !== auth.orgId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    user: auth.user,
    orgId: auth.orgId,
    agentName: auth.agentName,
    userClientId: auth.userClientId,
    thread: t,
  };
}
