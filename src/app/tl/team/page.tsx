"use client";

import { useState } from "react";
import { Segmented, Typography } from "antd";
import { useAuth } from "@/context/AuthContext";
import TeamHierarchyView from "@/components/TL/TeamHierarchyView";
import TeamBuilderDnDView from "@/components/TL/TeamBuilderDnDView";
import InactiveAgentsTransferSection from "@/components/TL/InactiveAgentsTransferSection";
import STLTeamBuilderDnDView from "@/components/STL/STLTeamBuilderDnDView";
import { isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";

const { Text } = Typography;

type TeamTier = "tl" | "stl";

export default function TLTeamPage() {
  const { hasRole, roles } = useAuth();
  const canBuildTeams = hasRole("operations_manager") || hasRole("admin");
  const isCampaignTl = roles.some((r) =>
    isCampaignTeamLeaderRole(r.role_name ?? r.name)
  );
  const [tier, setTier] = useState<TeamTier>("tl");

  return (
    <>
      <div
        style={{
          marginBottom: 24,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Team</h1>
          <Text type="secondary" style={{ fontSize: 14 }}>
            {canBuildTeams
              ? tier === "tl"
                ? "Drag agents into a Team Leader card to build or reorganize teams."
                : "Drag Team Leaders into a Senior Team Leader card to build or reorganize teams."
              : "Your team — agents assigned to you via campaigns or reporting line."}
          </Text>
        </div>
        {canBuildTeams && (
          <Segmented
            value={tier}
            onChange={(value) => setTier(value as TeamTier)}
            options={[
              { label: "Team Leaders", value: "tl" },
              { label: "Senior Team Leaders", value: "stl" },
            ]}
          />
        )}
      </div>
      {isCampaignTl && <InactiveAgentsTransferSection />}
      {canBuildTeams ? (
        tier === "tl" ? (
          <TeamBuilderDnDView />
        ) : (
          <STLTeamBuilderDnDView />
        )
      ) : (
        <TeamHierarchyView />
      )}
    </>
  );
}
