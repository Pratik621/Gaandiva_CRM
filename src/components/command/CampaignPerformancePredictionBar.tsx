"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Tooltip } from "antd";
import dayjs from "dayjs";
import {
  predictCampaignPerformance,
  type CampaignPerformancePrediction,
} from "@/lib/campaign-performance-prediction";

export type CampaignPredictionRow = {
  total_allocation: number | null;
  achieved: number | null;
  start_date: string | null;
  end_date: string | null;
  list_stats?: { total_leads?: number; delivered_count?: number } | null;
};

const METER_SEGMENTS = [
  { key: "bad", className: "bg-[#ef4444]", title: "Bad" },
  { key: "fair", className: "bg-[#f59e0b]", title: "Fair" },
  { key: "good", className: "bg-[#f59e0b]", title: "Good" },
  { key: "very_good", className: "bg-[#16a34a]", title: "Very Good" },
] as const;

const STATUS_EMOJI: Record<CampaignPerformancePrediction["status"], string> = {
  bad: "🔴",
  fair: "🟠",
  good: "🟡",
  very_good: "🟢",
};

function achievedLeadCount(row: CampaignPredictionRow): number {
  if (row.achieved != null && !Number.isNaN(Number(row.achieved))) {
    return Number(row.achieved);
  }
  return row.list_stats?.delivered_count ?? 0;
}

function buildTooltipContent(pred: CampaignPerformancePrediction) {
  return (
    <div className="text-xs leading-relaxed min-w-[180px]">
      <p className="font-semibold text-white mb-1.5">
        {STATUS_EMOJI[pred.status]} {pred.label}
      </p>
      <p>
        <span className="text-white/70">Progress:</span>{" "}
        <span className="text-white font-medium">{pred.campaignProgressPct}%</span>
      </p>
      <p>
        <span className="text-white/70">Remaining allocation:</span>{" "}
        <span className="text-white font-medium">{pred.remaining.toLocaleString()}</span>
      </p>
    </div>
  );
}

type Props = {
  row: CampaignPredictionRow;
};

export default function CampaignPerformancePredictionBar({ row }: Props) {
  const [todayKey, setTodayKey] = useState(() => dayjs().format("YYYY-MM-DD"));

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = dayjs().format("YYYY-MM-DD");
      setTodayKey((prev) => (prev !== next ? next : prev));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const pred = useMemo(
    () =>
      predictCampaignPerformance({
        totalAllocation: row.total_allocation ?? 0,
        achieved: achievedLeadCount(row),
        startDate: row.start_date,
        endDate: row.end_date,
        referenceDate: todayKey,
      }),
    [row, todayKey]
  );

  if ((row.total_allocation ?? 0) <= 0) return null;

  const markerLeft = `${pred.meterPosition}%`;

  return (
    <Tooltip title={buildTooltipContent(pred)} placement="top">
      <div
        className="relative w-full min-w-[100px] max-w-[132px] mx-auto px-0.5 py-1 cursor-default"
        aria-label={`Campaign health: ${pred.label}, ${pred.campaignProgressPct}% progress`}
      >
        <div className="relative h-3 w-full rounded-full overflow-visible shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06]">
          <div className="absolute inset-0 flex rounded-full overflow-hidden">
            {METER_SEGMENTS.map((seg) => (
              <div
                key={seg.key}
                className={`flex-1 ${seg.className}`}
                title={seg.title}
              />
            ))}
          </div>

          {/* Meter indicator */}
          <div
            className="absolute top-1/2 z-10 flex flex-col items-center pointer-events-none transition-[left] duration-300 ease-out"
            style={{ left: markerLeft, transform: "translate(-50%, -50%)" }}
          >
            <span className="block w-0 h-0 border-l-[4px] border-r-[4px] border-b-[5px] border-l-transparent border-r-transparent border-b-slate-500/90" />
            <span className="block w-[2px] h-[14px] rounded-full bg-slate-500/90 shadow-[0_0_0_1px_rgba(255,255,255,0.85)]" />
          </div>
        </div>
      </div>
    </Tooltip>
  );
}
