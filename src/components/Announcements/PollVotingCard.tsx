"use client";

import { useState } from "react";
import { Button, Progress, Radio, Space, Tag, Typography, message } from "antd";
import type { AnnouncementInboxItem, PollResults } from "@/lib/announcements/types";

const { Text } = Typography;

type PollVotingCardProps = {
  item: AnnouncementInboxItem;
  onVoted: () => void;
};

export default function PollVotingCard({ item, onVoted }: PollVotingCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localResults, setLocalResults] = useState<PollResults | null>(null);

  const results = localResults ?? item.poll_results;
  const hasVoted = Boolean(item.my_vote_option_id) || Boolean(localResults);
  const canVote = !hasVoted && !item.is_closed;

  const handleVote = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/announcements/${item.id}/vote`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: selected }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        results?: PollResults | null;
      };
      if (!res.ok) {
        message.error(json.error ?? "Failed to submit vote");
        return;
      }
      message.success("Vote submitted");
      setLocalResults(json.results ?? null);
      onVoted();
    } catch {
      message.error("Failed to submit vote");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {item.is_anonymous && <Tag color="default">Anonymous</Tag>}
        {item.is_closed ? (
          <Tag color="red">Closed</Tag>
        ) : item.closes_at ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Closes {new Date(item.closes_at).toLocaleString()}
          </Text>
        ) : null}
      </div>

      {canVote ? (
        <>
          <Radio.Group
            onChange={(e) => setSelected(e.target.value as string)}
            value={selected}
          >
            <Space direction="vertical">
              {(item.poll_options ?? []).map((option) => (
                <Radio key={option.id} value={option.id}>
                  {option.option_text}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
          <div>
            <Button
              type="primary"
              size="small"
              disabled={!selected}
              loading={submitting}
              onClick={handleVote}
            >
              Vote
            </Button>
          </div>
        </>
      ) : results ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {results.options.map((option) => {
            const percent =
              results.total_votes > 0
                ? Math.round((option.votes / results.total_votes) * 100)
                : 0;
            const isMine = option.id === item.my_vote_option_id;
            return (
              <div key={option.id}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, fontWeight: isMine ? 600 : 400 }}>
                    {option.option_text}
                    {isMine ? " (your vote)" : ""}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {option.votes} · {percent}%
                  </Text>
                </div>
                <Progress
                  percent={percent}
                  showInfo={false}
                  size="small"
                  strokeColor={isMine ? "#4f46e5" : "#94a3b8"}
                />
              </div>
            );
          })}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {results.total_votes} vote{results.total_votes === 1 ? "" : "s"}
          </Text>
        </div>
      ) : (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {item.is_closed ? "Poll closed." : "You have voted. Results appear once available."}
        </Text>
      )}
    </div>
  );
}
