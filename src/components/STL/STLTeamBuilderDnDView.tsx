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
  STLHierarchyData,
  STLNode,
  TeamLeaderMember,
} from "@/lib/stl/team-hierarchy";
import {
  getSTLLabel,
  getTeamLeaderMemberLabel,
} from "@/lib/stl/team-hierarchy";
import {
  STL_TEAM_ASSIGNMENT_CHANNEL,
  broadcastSTLTeamAssignmentUpdated,
} from "@/lib/stl/team-sync";
import { useCachedApiQuery } from "@/hooks/useCachedApiQuery";

const { Text, Title } = Typography;

const REFRESH_MS = 60_000;
const UNASSIGNED_DROPPABLE_ID = "__unassigned__";

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  border: "1px solid #f0f0f0",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  height: "100%",
};

const stlHeaderStyle: React.CSSProperties = {
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
  stls: STLNode[];
  unassigned: TeamLeaderMember[];
  updatedAt: string | null;
};

function buildLocalStateFromHierarchy(
  data: STLHierarchyData & { updated_at?: string }
): LocalState {
  return {
    stls: data.stls.map((s) => ({
      ...s,
      team_leaders: [...s.team_leaders],
    })),
    unassigned: [...data.unassigned_team_leaders],
    updatedAt: data.updated_at ?? null,
  };
}

// ─── Team Leader chip (presentational) ────────────────────────────────────────

function TeamLeaderChipBody({
  member,
  dragging,
}: {
  member: TeamLeaderMember;
  dragging?: boolean;
}) {
  const label = getTeamLeaderMemberLabel(member);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        background: dragging ? "#eef2ff" : "#fafafa",
        borderRadius: 10,
        border: dragging ? "1px dashed #4f46e5" : "1px solid #f0f0f0",
        userSelect: "none",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <Avatar size={32} style={{ background: "#52c41a", flexShrink: 0 }}>
        {initials(label)}
      </Avatar>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Text strong style={{ fontSize: 13, display: "block" }} ellipsis>
          {label}
        </Text>
        {member.email && (
          <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
            {member.email}
          </Text>
        )}
      </div>
      <DragOutlined style={{ color: "#9ca3af", fontSize: 14, flexShrink: 0 }} />
    </div>
  );
}

function DraggableTeamLeader({
  member,
  fromStlId,
  disabled,
}: {
  member: TeamLeaderMember;
  fromStlId: string | null; // null when from unassigned
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: member.id,
    data: { member, fromStlId },
    disabled,
  });

  return (
    <Tooltip
      title={
        disabled
          ? "Saving..."
          : member.email
            ? `${getTeamLeaderMemberLabel(member)} • ${member.email}`
            : getTeamLeaderMemberLabel(member)
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
        <TeamLeaderChipBody member={member} dragging={isDragging} />
      </div>
    </Tooltip>
  );
}

// ─── Droppable STL card ────────────────────────────────────────────────────────

function DroppableSTLCard({
  node,
  saving,
  filter,
}: {
  node: STLNode;
  saving: boolean;
  filter: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: node.id });
  const label = getSTLLabel(node);

  const filtered = useMemo(() => {
    if (!filter.trim()) return node.team_leaders;
    const f = filter.trim().toLowerCase();
    return node.team_leaders.filter((a) => {
      const lbl = getTeamLeaderMemberLabel(a).toLowerCase();
      const em = a.email?.toLowerCase() ?? "";
      return lbl.includes(f) || em.includes(f);
    });
  }, [node.team_leaders, filter]);

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
      <div style={stlHeaderStyle}>
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
              Senior Team Leader
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
                {node.team_leader_count} {node.team_leader_count === 1 ? "Team Leader" : "Team Leaders"}
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
              : node.team_leaders.length === 0
                ? "Drag a Team Leader here to add them to this team"
                : "No Team Leaders match your search"}
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
            {filtered.map((member) => (
              <DraggableTeamLeader
                key={member.id}
                member={member}
                fromStlId={node.id}
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
  unassigned: TeamLeaderMember[];
  saving: boolean;
  filter: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: UNASSIGNED_DROPPABLE_ID });

  const filtered = useMemo(() => {
    if (!filter.trim()) return unassigned;
    const f = filter.trim().toLowerCase();
    return unassigned.filter((a) => {
      const lbl = getTeamLeaderMemberLabel(a).toLowerCase();
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
          <span>Unassigned Team Leaders</span>
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
        Drag any Team Leader below into a Senior Team Leader card to assign them.
        Drop a Team Leader here to remove them from a team.
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
              ? "All Team Leaders are assigned to a Senior Team Leader"
              : "No Team Leaders match your search"}
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
          {filtered.map((member) => (
            <DraggableTeamLeader
              key={member.id}
              member={member}
              fromStlId={null}
              disabled={saving}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

type HierarchyResponse = STLHierarchyData & { updated_at?: string; scope?: string };

export default function STLTeamBuilderDnDView() {
  const [data, setData] = useState<LocalState | null>(null);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [activeMember, setActiveMember] = useState<TeamLeaderMember | null>(null);
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
    ["stl", "team", "hierarchy"],
    "/api/stl/team/hierarchy"
  );

  const loading = isLoading && !data;
  const refreshing = isFetching && Boolean(data);
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "Failed to load team"
    : null;

  useEffect(() => {
    if (!hierarchyData || dragLockRef.current || savingMemberId) return;
    setData(buildLocalStateFromHierarchy(hierarchyData));
  }, [hierarchyData, savingMemberId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (dragLockRef.current || savingMemberId) return;
      void refetch();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refetch, savingMemberId]);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(STL_TEAM_ASSIGNMENT_CHANNEL);
      channel.onmessage = () => {
        if (dragLockRef.current || savingMemberId) return;
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
  }, [refetch, savingMemberId]);

  const stats = useMemo(() => {
    if (!data) {
      return {
        stl_count: 0,
        total_team_leaders: 0,
        assigned_team_leaders: 0,
        unassigned_team_leaders: 0,
      };
    }
    const assigned = data.stls.reduce((acc, s) => acc + s.team_leaders.length, 0);
    return {
      stl_count: data.stls.length,
      total_team_leaders: assigned + data.unassigned.length,
      assigned_team_leaders: assigned,
      unassigned_team_leaders: data.unassigned.length,
    };
  }, [data]);

  const moveMemberLocally = useCallback(
    (
      state: LocalState,
      member: TeamLeaderMember,
      toStlId: string | null
    ): LocalState => {
      const cleanedSTLs = state.stls.map((s) => {
        const hadMember = s.team_leaders.some((a) => a.id === member.id);
        if (!hadMember) return s;
        return {
          ...s,
          team_leaders: s.team_leaders.filter((a) => a.id !== member.id),
          team_leader_count: Math.max(0, s.team_leader_count - 1),
        };
      });
      const cleanedUnassigned = state.unassigned.filter((a) => a.id !== member.id);

      if (toStlId === null) {
        return {
          ...state,
          stls: cleanedSTLs,
          unassigned: [...cleanedUnassigned, member].sort((a, b) =>
            getTeamLeaderMemberLabel(a).localeCompare(getTeamLeaderMemberLabel(b))
          ),
        };
      }

      return {
        ...state,
        stls: cleanedSTLs.map((s) =>
          s.id === toStlId
            ? {
                ...s,
                team_leaders: [...s.team_leaders, member].sort((a, b) =>
                  getTeamLeaderMemberLabel(a).localeCompare(getTeamLeaderMemberLabel(b))
                ),
                team_leader_count: s.team_leader_count + 1,
              }
            : s
        ),
        unassigned: cleanedUnassigned,
      };
    },
    []
  );

  const persistAssignment = useCallback(
    async (teamLeaderId: string, stlId: string | null) => {
      const res = await fetch("/api/stl/team/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ team_leader_id: teamLeaderId, stl_id: stlId }),
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
    const m = (event.active.data.current as { member?: TeamLeaderMember } | undefined)?.member;
    if (m) setActiveMember(m);
  }, []);

  const handleDragCancel = useCallback(() => {
    dragLockRef.current = false;
    setActiveMember(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      dragLockRef.current = false;
      setActiveMember(null);

      const { active, over } = event;
      if (!over || !data) return;

      const dragData = active.data.current as
        | { member: TeamLeaderMember; fromStlId: string | null }
        | undefined;
      if (!dragData) return;

      const { member, fromStlId } = dragData;
      const dropTargetId = String(over.id);
      const toStlId = dropTargetId === UNASSIGNED_DROPPABLE_ID ? null : dropTargetId;

      if (fromStlId === toStlId) return;

      const previous = data;
      const next = moveMemberLocally(previous, member, toStlId);
      setData(next);
      setSavingMemberId(member.id);

      try {
        await persistAssignment(member.id, toStlId);
        const targetLabel = toStlId
          ? getSTLLabel(
              previous.stls.find((s) => s.id === toStlId) ?? {
                full_name: null,
                email: null,
              }
            )
          : "Unassigned";
        message.success(`${getTeamLeaderMemberLabel(member)} → ${targetLabel}`);
        broadcastSTLTeamAssignmentUpdated();
      } catch (e) {
        setData(previous);
        message.error(e instanceof Error ? e.message : "Failed to update assignment");
      } finally {
        setSavingMemberId(null);
      }
    },
    [data, moveMemberLocally, persistAssignment]
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

  const stls = data?.stls ?? [];
  const unassigned = data?.unassigned ?? [];

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <Space direction="vertical" size={24} style={{ width: "100%" }}>
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
              placeholder="Search Team Leaders by name or email"
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
              <strong>Drag</strong> a Team Leader from one card to another to reassign
              their Senior Team Leader. Drop a Team Leader on the orange{" "}
              <strong>Unassigned</strong> panel to remove them from a team.
            </Text>
          </Space>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={12} sm={6}>
            <Card style={cardStyle}>
              <Statistic
                title="Senior Team Leaders"
                value={stats.stl_count}
                prefix={<CrownOutlined style={{ color: "#4f46e5" }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card style={cardStyle}>
              <Statistic
                title="Total Team Leaders"
                value={stats.total_team_leaders}
                prefix={<TeamOutlined style={{ color: "#52c41a" }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card style={cardStyle}>
              <Statistic
                title="Assigned"
                value={stats.assigned_team_leaders}
                prefix={<UserOutlined style={{ color: "#722ed1" }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card style={cardStyle}>
              <Statistic
                title="Unassigned"
                value={stats.unassigned_team_leaders}
                prefix={
                  <WarningOutlined
                    style={{ color: stats.unassigned_team_leaders ? "#f59e0b" : "#9ca3af" }}
                  />
                }
                valueStyle={{
                  color: stats.unassigned_team_leaders ? "#f59e0b" : undefined,
                }}
              />
            </Card>
          </Col>
        </Row>

        {stls.length > 1 && (
          <Card
            style={{ ...cardStyle, background: "#fafafa" }}
            styles={{ body: { padding: "16px 20px" } }}
          >
            <Space wrap size="middle" style={{ width: "100%", justifyContent: "center" }}>
              {stls.map((s) => (
                <Badge
                  key={s.id}
                  count={s.team_leaders.length}
                  overflowCount={99}
                  style={{ backgroundColor: "#4f46e5" }}
                  showZero
                >
                  <Tag style={{ padding: "6px 14px", fontSize: 13, borderRadius: 20 }}>
                    {getSTLLabel(s)}
                  </Tag>
                </Badge>
              ))}
            </Space>
          </Card>
        )}

        {stls.length === 0 ? (
          <Card style={cardStyle}>
            <Empty description="No Senior Team Leaders found in your organization. Create an STL user first." />
          </Card>
        ) : (
          <Row gutter={[20, 20]}>
            {stls.map((s) => (
              <Col xs={24} lg={12} xl={8} key={s.id}>
                <DroppableSTLCard
                  node={s}
                  saving={savingMemberId !== null}
                  filter={filter}
                />
              </Col>
            ))}
          </Row>
        )}

        <DroppableUnassignedPanel
          unassigned={unassigned}
          saving={savingMemberId !== null}
          filter={filter}
        />
      </Space>

      <DragOverlay dropAnimation={null}>
        {activeMember ? (
          <div style={{ width: 240 }}>
            <TeamLeaderChipBody member={activeMember} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
