"use client";

import { Card, Row, Col } from "antd";

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
};

function SkeletonBox({
  width,
  height,
  style = {},
}: {
  width: string | number;
  height: string | number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "#f0f0f0",
        borderRadius: 8,
        animation: "dashboard-skeleton-pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function StatCardSkeleton() {
  return (
    <Card bordered={false} style={{ ...cardStyle, height: "100%" }} styles={{ body: { padding: "24px" } }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <SkeletonBox width="60%" height={14} style={{ marginBottom: 8 }} />
          <SkeletonBox width="40%" height={32} style={{ marginBottom: 12 }} />
          <SkeletonBox width="50%" height={12} />
        </div>
        <SkeletonBox width={48} height={48} style={{ borderRadius: 12 }} />
      </div>
    </Card>
  );
}

export function StatCardsRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Col xs={24} sm={12} xl={6} key={i}>
          <StatCardSkeleton />
        </Col>
      ))}
    </Row>
  );
}

export function ChartSkeleton({ height = 320 }: { height?: number }) {
  return (
    <Card bordered={false} style={{ ...cardStyle, height: "100%" }} styles={{ body: { padding: "24px 24px 16px" } }}>
      <SkeletonBox width="40%" height={18} style={{ marginBottom: 16 }} />
      <div style={{ width: "100%", height }}>
        <SkeletonBox width="100%" height="100%" />
      </div>
    </Card>
  );
}

export function ChartsRowSkeleton({ count = 3, chartHeight = 320 }: { count?: number; chartHeight?: number }) {
  return (
    <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Col xs={24} xl={8} key={i}>
          <ChartSkeleton height={chartHeight} />
        </Col>
      ))}
    </Row>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card bordered={false} style={cardStyle} styles={{ body: { padding: "24px" } }}>
      <SkeletonBox width="30%" height={18} style={{ marginBottom: 16 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <SkeletonBox width={40} height={24} />
            <SkeletonBox width="25%" height={20} />
            <SkeletonBox width="15%" height={20} />
            <SkeletonBox width="15%" height={20} />
            <SkeletonBox width={80} height={28} style={{ marginLeft: "auto" }} />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function TasksAndActivitySkeleton() {
  return (
    <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
      <Col xs={24} xl={12}>
        <Card bordered={false} style={cardStyle} styles={{ body: { padding: "20px 24px" } }}>
          <SkeletonBox width="25%" height={18} style={{ marginBottom: 16 }} />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <SkeletonBox width="100%" height={48} style={{ borderRadius: 10 }} />
            </div>
          ))}
        </Card>
      </Col>
      <Col xs={24} xl={12}>
        <Card bordered={false} style={cardStyle} styles={{ body: { padding: "20px 24px" } }}>
          <SkeletonBox width="30%" height={18} style={{ marginBottom: 16 }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <SkeletonBox width={36} height={36} style={{ borderRadius: "50%", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <SkeletonBox width="90%" height={14} style={{ marginBottom: 6 }} />
                <SkeletonBox width="40%" height={12} />
              </div>
            </div>
          ))}
        </Card>
      </Col>
    </Row>
  );
}
