"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Typography, Card, Table, Spin, Empty, Button, message, Tag } from "antd";
import { ReloadOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

type DeliveredCampaignRow = {
  campaign_id: string;
  campaign_name: string;
  campaign_code: string | null;
  delivered_leads_count: number;
};

export default function MISLeadUploadPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DeliveredCampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mis/lead-upload/campaigns", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load campaigns");
      setRows(data.campaigns ?? []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to load campaigns");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const dataSource = useMemo(
    () =>
      rows.map((r, idx) => ({
        ...r,
        sr_no: idx + 1,
      })),
    [rows]
  );

  return (
    <div style={{ width: "100%", padding: "0 24px 32px" }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0, fontWeight: 600 }}>
          Lead Upload
        </Title>
        <Text type="secondary" style={{ fontSize: 14, display: "block", marginTop: 4 }}>
          Campaigns with delivered leads only.
        </Text>
      </div>

      <Card
        style={{ borderRadius: 8, border: "1px solid #f0f0f0", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
        bodyStyle={{ padding: 0 }}
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchRows} loading={loading}>
            Refresh
          </Button>
        }
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : dataSource.length === 0 ? (
          <Empty description="No campaigns with delivered leads" style={{ margin: "42px 0" }} />
        ) : (
          <Table
            size="middle"
            rowKey="campaign_id"
            dataSource={dataSource}
            pagination={{
              defaultPageSize: 15,
              showSizeChanger: true,
              pageSizeOptions: ["10", "15", "25", "50"],
              showTotal: (t) => `${t} campaigns`,
            }}
            onRow={(record) => ({
              onClick: () =>
                router.push(
                  `/mis/campaigns/${record.campaign_id}?delivery_status=delivered`
                ),
              style: { cursor: "pointer" },
            })}
            columns={[
              {
                title: "Sr. No.",
                dataIndex: "sr_no",
                key: "sr_no",
                width: 90,
                align: "center" as const,
              },
              {
                title: "Campaign Code",
                dataIndex: "campaign_code",
                key: "campaign_code",
                width: 130,
                render: (val: string | null) => (
                  <Tag color="blue" style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {val || "—"}
                  </Tag>
                ),
              },
              {
                title: "Campaign Name",
                dataIndex: "campaign_name",
                key: "campaign_name",
                ellipsis: true,
                render: (v: string) => (
                  <Typography.Text strong style={{ fontSize: 14 }}>
                    {v || "—"}
                  </Typography.Text>
                ),
              },
              {
                title: "Delivered Leads Count",
                dataIndex: "delivered_leads_count",
                key: "delivered_leads_count",
                width: 190,
                align: "center" as const,
                sorter: (a, b) => a.delivered_leads_count - b.delivered_leads_count,
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

