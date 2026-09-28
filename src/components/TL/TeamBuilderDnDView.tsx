"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  CrownOutlined,
  DragOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type {
  TeamHierarchyData,
  TeamLeaderNode,
  TeamMember,
} from "@/lib/tl/team-hierarchy";
import {
  getTeamLeaderLabel,
  getTeamMemberLabel,
} from "@/lib/tl/team-hierarchy";

const { Text, Title } = Typography;

const REFRESH_MS = 60_000;
const UNASSIGNED_DROPPABLE_ID = "__unassigned__";
// Channel name shared with TeamPerformanceDashboard so it can reload on change
import {
  TEAM_ASSIGNMENT_CHANNEL,
  broadcastTeamAssignmentUpdated,
} from "@/lib/tl/team-sync";
import { useCachedApiQuery } from "@/hooks/useCachedApiQuery";

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  border: "1px solid #f0f0f0",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  height: "100%",
};

const tlHeaderStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
  borderRadius: "12px 12px 0 0",
  margin: -24,
  marginBottom: 20,
  padding: "20px 24px",
  color: "#fff",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

type LocalState = {
  teamLeaders: TeamLeaderNode[];
  unassigned: TeamMember[];
  updatedAt: string | null;
};

function buildLocalStateFromHierarchy(
  data: TeamHierarchyData & { updated_at?: string }
): LocalState {
  return {
    teamLeaders: data.team_leaders.map((tl) => ({
      ...tl,
      agents: [...tl.agents],
    })),
    unassigned: [...data.unassigned_agents],
    updatedAt: data.updated_at ?? null,
  };
}

// ─── Agent chip (presentational) ──────────────────────────────────────────────

function AgentChipBody({
  agent,
  dragging,
  compact,
}: {
  agent: TeamMember;
  dragging?: boolean;
  compact?: boolean;
}) {
  const label = getTeamMemberLabel(agent);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: compact ? "6px 10px" : "8px 12px",
        background: dragging ? "#eef2ff" : "#fafafa",
        borderRadius: 10,
        border: dragging ? "1px dashed #4f46e5" : "1px solid #f0f0f0",
        userSelect: "none",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <Avatar size={compact ? 28 : 32} style={{ background: "#52c41a", flexShrink: 0 }}>
        {initials(label)}
      </Avatar>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Text strong style={{ fontSize: 13, display: "block" }} ellipsis>
          {label}
        </Text>
        {agent.email && (
          <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
            {agent.email}
          </Text>
        )}
      </div>
      <DragOutlined style={{ color: "#9ca3af", fontSize: 14, flexShrink: 0 }} />
    </div>
  );
}

function DraggableAgent({
  agent,
  fromTlId,
  disabled,
}: {
  agent: TeamMember;
  fromTlId: string | null; // null when from unassigned
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: agent.id,
    data: { agent, fromTlId },
    disabled,
  });

  return (
    <Tooltip
      title={
        disabled
          ? "Saving..."
          : agent.email
            ? `${getTeamMemberLabel(agent)} • ${agent.email}`
            : getTeamMemberLabel(agent)
      }
      placement="top"
    >
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        style={{
          transform: CSS.Translate.toString(transform),
          opacity: isDragging ? 0.35 : 1,
          cursor: disabled ? "not-allowed" : isDragging ? "grabbing" : "grab",
          touchAction: "none",
        }}
      >
        <AgentChipBody agent={agent} dragging={isDragging} />
      </div>
    </Tooltip>
  );
}

// ─── Droppable Team Leader card ───────────────────────────────────────────────

function DroppableTeamLeaderCard({
  node,
  saving,
  filter,
}: {
  node: TeamLeaderNode;
  saving: boolean;
  filter: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: node.id });
  const label = getTeamLeaderLabel(node);

  const filtered = useMemo(() => {
    if (!filter.trim()) return node.agents;
    const f = filter.trim().toLowerCase();
    return node.agents.filter((a) => {
      const lbl = getTeamMemberLabel(a).toLowerCase();
      const em = a.email?.toLowerCase() ?? "";
      return lbl.includes(f) || em.includes(f);
    });
  }, [node.agents, filter]);

  return (
    <Card
      ref={setNodeRef as unknown as React.RefObject<HTMLDivElement> | undefined}
      style={{
        ...cardStyle,
        borderColor: isOver ? "#4f46e5" : "#f0f0f0",
        boxShadow: isOver
          ? "0 0 0 3px rgba(79,70,229,0.12), 0 2px 8px rgba(0,0,0,0.06)"
          : cardStyle.boxShadow,
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
      styles={{ body: { paddingTop: 24 } }}
    >
      <div style={tlHeaderStyle}>
        <Space align="start" size={14} style={{ width: "100%" }}>
          <Avatar
            size={48}
            style={{
              background: "rgba(255,255,255,0.25)",
              border: "2px solid rgba(255,255,255,0.5)",
            }}
            icon={<CrownOutlined />}
          >
            {initials(label)}
          </Avatar>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12 }}>
              Team Leader
            </Text>
            <Title level={5} style={{ color: "#fff", margin: "2px 0 8px" }}>
              {label}
            </Title>
            <Space size={8} wrap>
              <Tag
                color="blue"
                style={{
                  margin: 0,
                  border: "none",
                  background: "rgba(255,255,255,0.2)",
                  color: "#fff",
                }}
              >
                {node.agent_count} {node.agent_count === 1 ? "Agent" : "Agents"}
              </Tag>
              <Tag
                style={{
                  margin: 0,
                  border: "none",
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                }}
              >
                {node.campaign_count}{" "}
                {node.campaign_count === 1 ? "Campaign" : "Campaigns"}
              </Tag>
            </Space>
          </div>
        </Space>
      </div>

      <div
        style={{
          minHeight: 110,
          padding: 12,
          borderRadius: 10,
          background: isOver ? "#eef2ff" : "#fafafa",
          border: `1px dashed ${isOver ? "#4f46e5" : "#e5e7eb"}`,
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              minHeight: 86,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isOver ? "#4f46e5" : "#9ca3af",
              fontSize: 13,
              textAlign: "center",
              padding: "8px 4px",
            }}
          >
            {isOver
              ? "Drop here to add to this team"
              : node.agents.length === 0
                ? "Drag an agent here to add them to this team"
                : "No agents match your search"}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 8,
              opacity: saving ? 0.7 : 1,
              pointerEvents: saving ? "none" : "auto",
            }}
          >
            {filtered.map((agent) => (
              <DraggableAgent
                key={agent.id}
                agent={agent}
                fromTlId={node.id}
                disabled={saving}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Droppable Unassigned panel ───────────────────────────────────────────────

function DroppableUnassignedPanel({
  unassigned,
  saving,
  filter,
}: {
  unassigned: TeamMember[];
  saving: boolean;
  filter: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: UNASSIGNED_DROPPABLE_ID });

  const filtered = useMemo(() => {
    if (!filter.trim()) return unassigned;
    const f = filter.trim().toLowerCase();
    return unassigned.filter((a) => {
      const lbl = getTeamMemberLabel(a).toLowerCase();
      const em = a.email?.toLowerCase() ?? "";
      return lbl.includes(f) || em.includes(f);
    });
  }, [unassigned, filter]);

  return (
    <Card
      ref={setNodeRef as unknown as React.RefObject<HTMLDivElement> | undefined}
      style={{
        ...cardStyle,
        borderColor: isOver ? "#f59e0b" : "#ffe7ba",
        background: isOver ? "#fff7e6" : "#fffbf0",
        boxShadow: isOver
          ? "0 0 0 3px rgba(250,140,22,0.12), 0 2px 8px rgba(0,0,0,0.06)"
          : cardStyle.boxShadow,
        transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s",
      }}
      title={
        <Space>
          <WarningOutlined style={{ color: "#f59e0b" }} />
          <span>Unassigned agents</span>
          <Tag color="orange" style={{ margin: 0 }}>
            {unassigned.length}
          </Tag>
        </Space>
      }
    >
      <Text
        type="secondary"
        style={{ display: "block", marginBottom: 12, fontSize: 13 }}
      >
        Drag any agent below into a Team Leader card to assign them. Drop an agent
        here to remove them from a team.
      </Text>

      {filtered.length === 0 ? (
        <div
          style={{
            minHeight: 96,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isOver ? "#f59e0b" : "#9ca3af",
            fontSize: 13,
            border: `1px dashed ${isOver ? "#f59e0b" : "#e5e7eb"}`,
            borderRadius: 10,
            background: isOver ? "#fff2e0" : "transparent",
          }}
        >
          {isOver
            ? "Drop here to remove from team"
            : unassigned.length === 0
              ? "All agents are assigned to a Team Leader"
              : "No agents match your search"}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 10,
            opacity: saving ? 0.7 : 1,
            pointerEvents: saving ? "none" : "auto",
          }}
        >
          {filtered.map((agent) => (
            <DraggableAgent
              key={agent.id}
              agent={agent}
              fromTlId={null}
              disabled={saving}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

type HierarchyResponse = TeamHierarchyData & { updated_at?: string; scope?: string };

export default function TeamBuilderDnDView() {
  const [data, setData] = useState<LocalState | null>(null);
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<TeamMember | null>(null);
  const [filter, setFilter] = useState("");

  const dragLockRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const {
    data: hierarchyData,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useCachedApiQuery<HierarchyResponse>(
    ["tl", "team", "hierarchy"],
    "/api/tl/team/hierarchy"
  );

  const loading = isLoading && !data;
  const refreshing = isFetching && Boolean(data);
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "Failed to load team"
    : null;

  useEffect(() => {
    if (!hierarchyData || dragLockRef.current || savingAgentId) return;
    setData(buildLocalStateFromHierarchy(hierarchyData));
  }, [hierarchyData, savingAgentId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (dragLockRef.current || savingAgentId) return;
      void refetch();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refetch, savingAgentId]);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(TEAM_ASSIGNMENT_CHANNEL);
      channel.onmessage = () => {
        if (dragLockRef.current || savingAgentId) return;
        void refetch();
      };
    } catch {
      // ignore
    }
    return () => {
      if (channel) {
        channel.onmessage = null;
        channel.close();
      }
    };
  }, [refetch, savingAgentId]);

  const stats = useMemo(() => {
    if (!data) {
      return {
        team_leader_count: 0,
        total_agents: 0,
        assigned_agents: 0,
        unassigned_agents: 0,
      };
    }
    const assigned = data.teamLeaders.reduce((acc, tl) => acc + tl.agents.length, 0);
    return {
      team_leader_count: data.teamLeaders.length,
      total_agents: assigned + data.unassigned.length,
      assigned_agents: assigned,
      unassigned_agents: data.unassigned.length,
    };
  }, [data]);

  /**
   * Locally moves the agent from `fromTlId` (or unassigned) to `toTlId`
   * (or unassigned). Returns the new state for the optimistic update.
   */
  const moveAgentLocally = useCallback(
    (
      state: LocalState,
      agent: TeamMember,
      toTlId: string | null
    ): LocalState => {
      // Strip the agent from every TL and from unassigned first,
      // so they can never appear in two places simultaneously.
      const cleanedTLs = state.teamLeaders.map((tl) => {
        const hadAgent = tl.agents.some((a) => a.id === agent.id);
        if (!hadAgent) return tl;
        return {
          ...tl,
          agents: tl.agents.filter((a) => a.id !== agent.id),
          agent_count: Math.max(0, tl.agent_count - 1),
        };
      });
      const cleanedUnassigned = state.unassigned.filter((a) => a.id !== agent.id);

      // Now add to the target.
      if (toTlId === null) {
        return {
          ...state,
          teamLeaders: cleanedTLs,
          unassigned: [...cleanedUnassigned, agent].sort((a, b) =>
            getTeamMemberLabel(a).localeCompare(getTeamMemberLabel(b))
          ),
        };
      }

      return {
        ...state,
        teamLeaders: cleanedTLs.map((tl) =>
          tl.id === toTlId
            ? {
                ...tl,
                agents: [...tl.agents, agent].sort((a, b) =>
                  getTeamMemberLabel(a).localeCompare(getTeamMemberLabel(b))
                ),
                agent_count: tl.agent_count + 1,
              }
            : tl
        ),
        unassigned: cleanedUnassigned,
      };
    },
    []
  );

  const persistAssignment = useCallback(
    async (agentId: string, tlId: string | null) => {
      const res = await fetch("/api/tl/team/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agent_id: agentId, team_leader_id: tlId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error ?? "Failed to update assignment"
        );
      }
    },
    []
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    dragLockRef.current = true;
    const ag = (event.active.data.current as { agent?: TeamMember } | undefined)?.agent;
    if (ag) setActiveAgent(ag);
  }, []);

  const handleDragCancel = useCallback(() => {
    dragLockRef.current = false;
    setActiveAgent(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      dragLockRef.current = false;
      setActiveAgent(null);

      const { active, over } = event;
      if (!over || !data) return;

      const dragData = active.data.current as
        | { agent: TeamMember; fromTlId: string | null }
        | undefined;
      if (!dragData) return;

      const { agent, fromTlId } = dragData;
      const dropTargetId = String(over.id);
      const toTlId =
        dropTargetId === UNASSIGNED_DROPPABLE_ID ? null : dropTargetId;

      if (fromTlId === toTlId) return; // No-op: dropped back where it came from

      const previous = data;
      const next = moveAgentLocally(previous, agent, toTlId);
      setData(next);
      setSavingAgentId(agent.id);

      try {
        await persistAssignment(agent.id, toTlId);
        const targetLabel = toTlId
          ? getTeamLeaderLabel(
              previous.teamLeaders.find((tl) => tl.id === toTlId) ?? {
                full_name: null,
                email: null,
              }
            )
          : "Unassigned";
        message.success(`${getTeamMemberLabel(agent)} → ${targetLabel}`);
        broadcastTeamAssignmentUpdated();
      } catch (e) {
        setData(previous); // rollback
        message.error(e instanceof Error ? e.message : "Failed to update assignment");
      } finally {
        setSavingAgentId(null);
      }
    },
    [data, moveAgentLocally, persistAssignment]
  );

  if (loading && !data) {
    return (
      <Space direction="vertical" size={24} style={{ width: "100%" }}>
        <Row gutter={[16, 16]}>
          {[1, 2, 3, 4].map((k) => (
            <Col xs={12} sm={6} key={k}>
              <Card style={cardStyle}>
                <Skeleton active paragraph={{ rows: 1 }} />
              </Card>
            </Col>
          ))}
        </Row>
        <Row gutter={[20, 20]}>
          {[1, 2].map((k) => (
            <Col xs={24} lg={12} key={k}>
              <Card style={cardStyle}>
                <Skeleton active paragraph={{ rows: 6 }} />
              </Card>
            </Col>
          ))}
        </Row>
      </Space>
    );
  }

  if (error && !data) {
    return (
      <Card style={cardStyle}>
        <Empty description={error}>
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => void refetch()}>
            Retry
          </Button>
        </Empty>
      </Card>
    );
  }

  const teamLeaders = data?.teamLeaders ?? [];
  const unassigned = data?.unassigned ?? [];

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <Space direction="vertical" size={24} style={{ width: "100%" }}>
        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: "#9ca3af" }} />}
              placeholder="Search agents by name or email"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ width: 280 }}
            />
            {data?.updatedAt && (
              <Text type="secondary" style={{ fontSize: 13 }}>
                Last updated {new Date(data.updatedAt).toLocaleTimeString()}
              </Text>
            )}
          </Space>
          <Button
            icon={<ReloadOutlined spin={refreshing} />}
            onClick={() => void refetch()}
            loading={refreshing}
          >
            Refresh
          </Button>
        </div>

        {/* How-to banner */}
        <Card
          style={{
            ...cardStyle,
            background: "linear-gradient(135deg, #f0f5ff 0%, #f9f0ff 100%)",
            borderColor: "#d6e4ff",
          }}
          styles={{ body: { padding: "14px 18px" } }}
        >
          <Space size={10}>
            <DragOutlined style={{ color: "#4f46e5", fontSize: 18 }} />
            <Text style={{ fontSize: 13 }}>
              <strong>Drag</strong> an agent from one card to another to reassign their
              Team Leader. Drop an agent on the orange <strong>Unassigned</strong> panel
              to remove them from a team.
            </Text>
          </Space>
        </Card>

        {/* Stats */}
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={6}>
            <Card style={cardStyle}>
              <Statistic
                title="Team Leaders"
                value={stats.team_leader_count}
                prefix={<CrownOutlined style={{ color: "#4f46e5" }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card style={cardStyle}>
              <Statistic
                title="Total Agents"
                value={stats.total_agents}
                prefix={<TeamOutlined style={{ color: "#52c41a" }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card style={cardStyle}>
              <Statistic
                title="Assigned"
                value={stats.assigned_agents}
                prefix={<UserOutlined style={{ color: "#722ed1" }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card style={cardStyle}>
              <Statistic
                title="Unassigned"
                value={stats.unassigned_agents}
                prefix={
                  <WarningOutlined
                    style={{ color: stats.unassigned_agents ? "#f59e0b" : "#9ca3af" }}
                  />
                }
                valueStyle={{
                  color: stats.unassigned_agents ? "#f59e0b" : undefined,
                }}
              />
            </Card>
          </Col>
        </Row>

        {/* TL chip strip (overview) */}
        {teamLeaders.length > 1 && (
          <Card
            style={{ ...cardStyle, background: "#fafafa" }}
            styles={{ body: { padding: "16px 20px" } }}
          >
            <Space wrap size="middle" style={{ width: "100%", justifyContent: "center" }}>
              {teamLeaders.map((tl) => (
                <Badge
                  key={tl.id}
                  count={tl.agents.length}
                  overflowCount={99}
                  style={{ backgroundColor: "#4f46e5" }}
                  showZero
                >
                  <Tag style={{ padding: "6px 14px", fontSize: 13, borderRadius: 20 }}>
                    {getTeamLeaderLabel(tl)}
                  </Tag>
                </Badge>
              ))}
            </Space>
          </Card>
        )}

        {/* Team leader cards */}
        {teamLeaders.length === 0 ? (
          <Card style={cardStyle}>
            <Empty description="No team leaders found in your organization. Create a Team Leader user first." />
          </Card>
        ) : (
          <Row gutter={[20, 20]}>
            {teamLeaders.map((tl) => (
              <Col xs={24} lg={12} xl={8} key={tl.id}>
                <DroppableTeamLeaderCard
                  node={tl}
                  saving={savingAgentId !== null}
                  filter={filter}
                />
              </Col>
            ))}
          </Row>
        )}

        {/* Unassigned panel */}
        <DroppableUnassignedPanel
          unassigned={unassigned}
          saving={savingAgentId !== null}
          filter={filter}
        />
      </Space>

      {/* Floating drag preview */}
      <DragOverlay dropAnimation={null}>
        {activeAgent ? (
          <div style={{ width: 240 }}>
            <AgentChipBody agent={activeAgent} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
