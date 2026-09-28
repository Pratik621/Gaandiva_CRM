"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Progress, Space, Steps, Tag, Typography, message } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadFinderRun } from "@/lib/lead-finder/types";

const { Text } = Typography;

const POLL_MS = 10_000;

type StatusResponse = {
  run: LeadFinderRun;
  engine_status: string | null;
  ready_to_import: boolean;
  error?: string;
};

/**
 * Live status for the active run: polls every 10s while the actor runs, then
 * drives the chunked import — each import call returns { done }, and the card
 * immediately re-invokes until done (max-iteration guard lives server-side).
 */
export default function RunStatusCard({
  runId,
  onFinished,
}: {
  runId: string;
  onFinished: () => void;
}) {
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);

  const { data } = useQuery({
    queryKey: ["lead-finder", "run", runId],
    queryFn: async (): Promise<StatusResponse> => {
      const res = await fetch(`/api/admin/lead-finder/runs/${runId}`, {
        credentials: "include",
      });
      const json = (await res.json()) as StatusResponse;
      if (!res.ok) throw new Error(json.error ?? "Failed to load run status");
      return json;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.run.status;
      return status === "RUNNING" || status === "IMPORTING" ? POLL_MS : false;
    },
  });

  const run = data?.run;

  // Keep the latest callback without making it an effect dependency —
  // an unstable identity here would re-arm the import loop on every render.
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  // Once an import cycle reports done, never auto-start another for this run.
  const completedRef = useRef(false);

  // Drive the self-continuing import once the engine run has succeeded.
  useEffect(() => {
    const shouldImport =
      !completedRef.current &&
      run?.status !== "SUCCEEDED" &&
      (Boolean(data?.ready_to_import) || run?.status === "IMPORTING");
    if (!shouldImport || importingRef.current) return;

    importingRef.current = true;
    setImporting(true);

    void (async () => {
      try {
        let lastProgress = -1;
        for (;;) {
          const res = await fetch(`/api/admin/lead-finder/runs/${runId}/import`, {
            method: "POST",
            credentials: "include",
          });
          const json = (await res.json().catch(() => ({}))) as {
            done?: boolean;
            progress?: number;
            error?: string;
          };
          if (!res.ok) {
            message.error(json.error ?? "Import failed — use Resume to retry");
            break;
          }
          void queryClient.invalidateQueries({ queryKey: ["lead-finder", "run", runId] });
          if (json.done) {
            completedRef.current = true;
            message.success("Import complete");
            onFinishedRef.current();
            break;
          }
          // Stall guard: a not-done response must have advanced progress,
          // otherwise something server-side is wedged — stop looping.
          const progress = json.progress ?? -1;
          if (progress <= lastProgress) {
            message.error("Import is not progressing — use Resume to retry");
            break;
          }
          lastProgress = progress;
        }
      } finally {
        importingRef.current = false;
        setImporting(false);
        void queryClient.invalidateQueries({ queryKey: ["lead-finder", "run", runId] });
      }
    })();
  }, [data?.ready_to_import, run?.status, runId, queryClient]);

  if (!run) {
    return <Card loading style={{ borderRadius: 12 }} />;
  }

  const stage =
    run.status === "SUCCEEDED"
      ? 3
      : run.status === "IMPORTING"
      ? 2
      : data?.ready_to_import
      ? 1
      : 0;
  const failed = run.status === "FAILED" || run.status === "ABORTED";
  const percent =
    run.total_found > 0
      ? Math.min(100, Math.round((run.progress / run.total_found) * 100))
      : run.status === "SUCCEEDED"
      ? 100
      : 0;

  return (
    <Card
      title={
        <Space>
          <Text strong>{run.batch_name}</Text>
          <Tag
            color={
              failed
                ? "red"
                : run.status === "SUCCEEDED"
                ? "green"
                : "processing"
            }
          >
            {run.status}
          </Tag>
        </Space>
      }
      style={{ borderRadius: 12 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Steps
          size="small"
          current={stage}
          status={failed ? "error" : run.status === "SUCCEEDED" ? "finish" : "process"}
          items={[
            { title: "Running" },
            { title: "Fetching" },
            { title: "Importing" },
            { title: "Done" },
          ]}
        />

        {run.status === "IMPORTING" || run.status === "SUCCEEDED" ? (
          <>
            <Progress percent={percent} status={failed ? "exception" : undefined} />
            <Text type="secondary">
              {run.progress.toLocaleString()} / {(run.total_found || run.progress).toLocaleString()}{" "}
              imported · {run.inserted_count.toLocaleString()} new ·{" "}
              {run.updated_count.toLocaleString()} updated · {run.skipped_count.toLocaleString()}{" "}
              skipped
            </Text>
          </>
        ) : run.status === "RUNNING" ? (
          <Text type="secondary">
            🤖 AI agent is searching the B2B database
            {data?.engine_status ? ` (${data.engine_status.toLowerCase()})` : ""} — this can take a
            few minutes depending on lead count…
          </Text>
        ) : null}

        {failed ? (
          <Text type="danger">{run.error_message ?? "Run failed"}</Text>
        ) : null}

        {run.status === "IMPORTING" && !importing ? (
          <div>
            <Button
              type="primary"
              onClick={() => {
                // Re-arm the import loop (e.g. after a network hiccup).
                void queryClient.invalidateQueries({ queryKey: ["lead-finder", "run", runId] });
              }}
            >
              Resume import
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
