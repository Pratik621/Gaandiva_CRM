"use client";

import { Badge } from "antd";
import { MessageOutlined } from "@ant-design/icons";

type FeedLaunchButtonProps = {
  unreadCount: number;
  onClick: () => void;
};

export function FeedLaunchButton({ unreadCount, onClick }: FeedLaunchButtonProps) {
  return (
    <div className="feed-float-wrap">
      <Badge
        count={unreadCount}
        size="small"
        offset={[-6, 6]}
        overflowCount={99}
        style={{ backgroundColor: "#ef4444" }}
      >
        <button type="button" className="feed-float-pill" onClick={onClick}>
          <span className="feed-btn-icon feed-float-pill__icon">
            <MessageOutlined />
          </span>
          <span className="feed-float-pill__label">Campaign Workspace</span>
        </button>
      </Badge>
    </div>
  );
}
