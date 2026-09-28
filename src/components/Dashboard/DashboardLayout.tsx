"use client";

import AppLayout from "./AppLayout";
import StatsCards from "./StatsCards";
import SalesChart from "./SalesChart";
import DealsTable from "./DealsTable";
import ActivityFeed from "./ActivityFeed";
import PipelineChart from "./PipelineChart";

export default function DashboardLayout() {
  return (
    <AppLayout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Dashboard</h1>
        <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
          Welcome back! Here&apos;s what&apos;s happening with your pipeline.
        </p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <StatsCards />
      </div>

      <div style={{ marginBottom: 24 }}>
        <SalesChart />
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 400px", minWidth: 0 }}>
          <DealsTable />
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
          <div style={{ marginBottom: 24 }}>
            <PipelineChart />
          </div>
          <ActivityFeed />
        </div>
      </div>
    </AppLayout>
  );
}
