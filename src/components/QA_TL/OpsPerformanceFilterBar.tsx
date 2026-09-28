"use client";

import { useMemo } from "react";
import type { Dayjs } from "dayjs";
import {
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  DatePicker,
  Row,
  Select,
  Space,
  Tag,
  TimePicker,
  Typography,
} from "antd";
import { ClearOutlined, FilterOutlined } from "@ant-design/icons";
import type { OpsReportFilterOptions } from "@/lib/qatl/ops-performance-filters";

const { Text } = Typography;
const { RangePicker } = DatePicker;

export type OpsReportUiFilters = {
  dateRange: [Dayjs, Dayjs];
  startTime: Dayjs;
  endTime: Dayjs;
  tlIds: string[];
  agentIds: string[];
  campaignIds: string[];
  leadTypes: string[];
  regions: string[];
  channels: string[];
  qaStatuses: string[];
};

type Chip = {
  key: string;
  label: string;
  onClose: () => void;
};

type Props = {
  filters: OpsReportUiFilters;
  options: OpsReportFilterOptions | undefined;
  optionsLoading?: boolean;
  onChange: (next: OpsReportUiFilters) => void;
  onClearAll: () => void;
};

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
} as const;

function countActive(filters: OpsReportUiFilters): number {
  let n = 0;
  if (filters.tlIds.length) n += 1;
  if (filters.agentIds.length) n += 1;
  if (filters.campaignIds.length) n += 1;
  if (filters.leadTypes.length) n += 1;
  if (filters.regions.length) n += 1;
  if (filters.channels.length) n += 1;
  if (filters.qaStatuses.length) n += 1;
  const st = filters.startTime.format("HH:mm");
  const et = filters.endTime.format("HH:mm");
  if (st !== "00:00" || et !== "23:59") n += 1;
  return n;
}

export default function OpsPerformanceFilterBar({
  filters,
  options,
  optionsLoading,
  onChange,
  onClearAll,
}: Props) {
  const activeCount = countActive(filters);

  const agentOptions = useMemo(() => {
    if (!options) return [];
    if (filters.tlIds.length === 0) {
      return options.agents.map((a) => ({ value: a.id, label: a.name }));
    }
    const tlSet = new Set(filters.tlIds);
    const seen = new Set<string>();
    const list: { value: string; label: string }[] = [];
    for (const tl of options.team_leaders) {
      if (!tlSet.has(tl.id)) continue;
      for (const a of tl.agents) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        list.push({ value: a.id, label: a.name });
      }
    }
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [options, filters.tlIds]);

  const chips = useMemo<Chip[]>(() => {
    if (!options) return [];
    const out: Chip[] = [];
    const st = filters.startTime.format("HH:mm");
    const et = filters.endTime.format("HH:mm");
    if (st !== "00:00" || et !== "23:59") {
      out.push({
        key: "time",
        label: `Time: ${st} → ${et}`,
        onClose: () =>
          onChange({
            ...filters,
            startTime: filters.startTime.hour(0).minute(0).second(0),
            endTime: filters.endTime.hour(23).minute(59).second(0),
          }),
      });
    }
    for (const id of filters.tlIds) {
      const tl = options.team_leaders.find((t) => t.id === id);
      out.push({
        key: `tl-${id}`,
        label: `TL: ${tl?.name ?? id}`,
        onClose: () => {
          const remainingTls = filters.tlIds.filter((x) => x !== id);
          const allowed =
            remainingTls.length === 0
              ? null
              : new Set(
                  remainingTls.flatMap(
                    (tid) =>
                      options.team_leaders.find((t) => t.id === tid)?.agents.map((a) => a.id) ??
                      []
                  )
                );
          onChange({
            ...filters,
            tlIds: remainingTls,
            agentIds: allowed
              ? filters.agentIds.filter((aid) => allowed.has(aid))
              : filters.agentIds,
          });
        },
      });
    }
    for (const id of filters.agentIds) {
      const label =
        agentOptions.find((a) => a.value === id)?.label ||
        options.agents.find((a) => a.id === id)?.name ||
        id;
      out.push({
        key: `agent-${id}`,
        label: `Agent: ${label}`,
        onClose: () =>
          onChange({ ...filters, agentIds: filters.agentIds.filter((x) => x !== id) }),
      });
    }
    for (const id of filters.campaignIds) {
      const c = options.campaigns.find((x) => x.id === id);
      out.push({
        key: `camp-${id}`,
        label: `Campaign: ${c?.name ?? id}`,
        onClose: () =>
          onChange({
            ...filters,
            campaignIds: filters.campaignIds.filter((x) => x !== id),
          }),
      });
    }
    for (const v of filters.leadTypes) {
      out.push({
        key: `lt-${v}`,
        label: `Lead type: ${v}`,
        onClose: () =>
          onChange({ ...filters, leadTypes: filters.leadTypes.filter((x) => x !== v) }),
      });
    }
    for (const v of filters.regions) {
      out.push({
        key: `region-${v}`,
        label: `Region: ${v}`,
        onClose: () =>
          onChange({ ...filters, regions: filters.regions.filter((x) => x !== v) }),
      });
    }
    for (const v of filters.channels) {
      out.push({
        key: `ch-${v}`,
        label: `Channel: ${v}`,
        onClose: () =>
          onChange({ ...filters, channels: filters.channels.filter((x) => x !== v) }),
      });
    }
    for (const v of filters.qaStatuses) {
      const label = options.qa_statuses.find((s) => s.value === v)?.label ?? v;
      out.push({
        key: `qa-${v}`,
        label: `Status: ${label}`,
        onClose: () =>
          onChange({
            ...filters,
            qaStatuses: filters.qaStatuses.filter((x) => x !== v),
          }),
      });
    }
    return out;
  }, [filters, options, agentOptions, onChange]);

  const selectAllAgentsUnderTl = () => {
    onChange({ ...filters, agentIds: agentOptions.map((a) => a.value) });
  };

  return (
    <Card style={{ ...cardStyle, marginBottom: 16 }} styles={{ body: { padding: 0 } }}>
      <Collapse
        bordered={false}
        defaultActiveKey={["filters"]}
        items={[
          {
            key: "filters",
            label: (
              <Space size={8}>
                <FilterOutlined />
                <Text strong>Report filters</Text>
                {activeCount > 0 ? <Badge count={activeCount} color="#4f46e5" /> : null}
              </Space>
            ),
            children: (
              <div style={{ padding: "0 16px 16px" }}>
                <Row gutter={[12, 12]}>
                  <Col xs={24} md={10} lg={8}>
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                      Date range
                    </Text>
                    <RangePicker
                      allowClear={false}
                      style={{ width: "100%" }}
                      value={filters.dateRange}
                      format="DD MMM YYYY"
                      onChange={(vals) => {
                        if (vals?.[0] && vals?.[1]) {
                          onChange({ ...filters, dateRange: [vals[0], vals[1]] });
                        }
                      }}
                    />
                  </Col>
                  <Col xs={12} md={7} lg={4}>
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                      Start time
                    </Text>
                    <TimePicker
                      allowClear={false}
                      format="HH:mm"
                      style={{ width: "100%" }}
                      value={filters.startTime}
                      onChange={(v) => {
                        if (v) onChange({ ...filters, startTime: v });
                      }}
                    />
                  </Col>
                  <Col xs={12} md={7} lg={4}>
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                      End time
                    </Text>
                    <TimePicker
                      allowClear={false}
                      format="HH:mm"
                      style={{ width: "100%" }}
                      value={filters.endTime}
                      onChange={(v) => {
                        if (v) onChange({ ...filters, endTime: v });
                      }}
                    />
                  </Col>
                  <Col xs={24} md={12} lg={8}>
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                      Team leader
                    </Text>
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="All team leaders"
                      style={{ width: "100%" }}
                      loading={optionsLoading}
                      value={filters.tlIds}
                      options={(options?.team_leaders ?? []).map((tl) => ({
                        value: tl.id,
                        label: tl.name,
                      }))}
                      onChange={(tlIds: string[]) => {
                        const tlSet = new Set(tlIds);
                        const allowed = new Set(
                          (options?.team_leaders ?? [])
                            .filter((tl) => tlSet.has(tl.id))
                            .flatMap((tl) => tl.agents.map((a) => a.id))
                        );
                        onChange({
                          ...filters,
                          tlIds,
                          agentIds:
                            tlIds.length === 0
                              ? filters.agentIds
                              : filters.agentIds.filter((id) => allowed.has(id)),
                        });
                      }}
                    />
                  </Col>
                  <Col xs={24} md={12} lg={8}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Agents
                      </Text>
                      {filters.tlIds.length > 0 && agentOptions.length > 0 ? (
                        <Button type="link" size="small" onClick={selectAllAgentsUnderTl} style={{ padding: 0 }}>
                          Select all under TL
                        </Button>
                      ) : null}
                    </div>
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder={
                        filters.tlIds.length
                          ? "All agents under selected TL(s)"
                          : "All agents"
                      }
                      style={{ width: "100%" }}
                      loading={optionsLoading}
                      value={filters.agentIds}
                      options={agentOptions}
                      onChange={(agentIds: string[]) => onChange({ ...filters, agentIds })}
                    />
                  </Col>
                  <Col xs={24} md={12} lg={8}>
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                      Campaign
                    </Text>
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="All campaigns"
                      style={{ width: "100%" }}
                      loading={optionsLoading}
                      value={filters.campaignIds}
                      options={(options?.campaigns ?? []).map((c) => ({
                        value: c.id,
                        label: c.name,
                      }))}
                      onChange={(campaignIds: string[]) => onChange({ ...filters, campaignIds })}
                    />
                  </Col>
                  <Col xs={24} md={8} lg={6}>
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                      Lead type
                    </Text>
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      placeholder="All lead types"
                      style={{ width: "100%" }}
                      loading={optionsLoading}
                      value={filters.leadTypes}
                      options={(options?.lead_types ?? []).map((v) => ({ value: v, label: v }))}
                      onChange={(leadTypes: string[]) => onChange({ ...filters, leadTypes })}
                    />
                  </Col>
                  <Col xs={24} md={8} lg={6}>
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                      Region
                    </Text>
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      placeholder="All regions"
                      style={{ width: "100%" }}
                      loading={optionsLoading}
                      value={filters.regions}
                      options={(options?.regions ?? []).map((v) => ({ value: v, label: v }))}
                      onChange={(regions: string[]) => onChange({ ...filters, regions })}
                    />
                  </Col>
                  <Col xs={24} md={8} lg={6}>
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                      Channel
                    </Text>
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder="All channels"
                      style={{ width: "100%" }}
                      value={filters.channels}
                      options={(options?.channels ?? []).map((v) => ({
                        value: v,
                        label: v === "telemarketing" ? "Telemarketing" : "Email",
                      }))}
                      onChange={(channels: string[]) => onChange({ ...filters, channels })}
                    />
                  </Col>
                  <Col xs={24} md={8} lg={6}>
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                      Status
                    </Text>
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder="All statuses"
                      style={{ width: "100%" }}
                      value={filters.qaStatuses}
                      options={options?.qa_statuses ?? []}
                      onChange={(qaStatuses: string[]) => onChange({ ...filters, qaStatuses })}
                    />
                  </Col>
                </Row>

                {chips.length > 0 ? (
                  <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    {chips.map((chip) => (
                      <Tag key={chip.key} closable onClose={chip.onClose} color="blue">
                        {chip.label}
                      </Tag>
                    ))}
                    <Button size="small" icon={<ClearOutlined />} onClick={onClearAll}>
                      Clear all filters
                    </Button>
                  </div>
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
}
