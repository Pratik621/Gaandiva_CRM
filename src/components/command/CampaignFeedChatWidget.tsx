"use client";

import { Button, Typography } from "antd";
import {
  CloseOutlined,
  ExpandOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import CampaignFeedTab from "./CampaignFeedTab";
import { FeedLaunchButton } from "./FeedLaunchButton";

const { Text } = Typography;

type CampaignFeedChatWidgetProps = {
  campaignId: string;
  campaignName: string;
  unreadCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExpand: () => void;
};

export function CampaignFeedChatWidget({
  campaignId,
  campaignName,
  unreadCount,
  open,
  onOpenChange,
  onExpand,
}: CampaignFeedChatWidgetProps) {
  const handleExpand = () => {
    onOpenChange(false);
    onExpand();
  };

  if (!open) {
    return (
      <FeedLaunchButton
        unreadCount={unreadCount}
        onClick={() => onOpenChange(true)}
      />
    );
  }

  return (
    <div className="feed-chat-widget" role="dialog" aria-label="Campaign Workspace">
      <div className="feed-chat-widget__header">
        <div className="feed-chat-widget__header-main">
          <div className="feed-chat-widget__avatar">
            <MessageOutlined />
          </div>
          <div className="feed-chat-widget__title-wrap">
            <Text strong className="feed-chat-widget__title" ellipsis>
              {campaignName}
            </Text>
            <Text type="secondary" className="feed-chat-widget__subtitle">
              Campaign Workspace
            </Text>
          </div>
        </div>
        <div className="feed-chat-widget__header-actions">
          <Button
            type="text"
            size="small"
            icon={<ExpandOutlined />}
            aria-label="Open full workspace"
            onClick={handleExpand}
            className="feed-chat-widget__icon-btn"
          />
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            aria-label="Close workspace"
            onClick={() => onOpenChange(false)}
            className="feed-chat-widget__icon-btn"
          />
        </div>
      </div>

      <div className="feed-chat-widget__body">
        <CampaignFeedTab campaignId={campaignId} variant="chat" />
      </div>
    </div>
  );
}
