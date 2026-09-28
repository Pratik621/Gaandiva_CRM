"use client";

import { Typography } from "antd";
import { useAuth } from "@/context/AuthContext";
import STLTeamHierarchyView from "@/components/STL/STLTeamHierarchyView";
import STLTeamBuilderDnDView from "@/components/STL/STLTeamBuilderDnDView";
import { isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";

const { Text } = Typography;

export default function STLTeamPage() {
  const { hasRole, roles } = useAuth();
  const canBuildTeams = hasRole("operations_manager") || hasRole("admin");
  const isSTL = roles.some((r) => isSeniorTeamLeaderRole(r.role_name ?? r.name));

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Team</h1>
        <Text type="secondary" style={{ fontSize: 14 }}>
          {canBuildTeams
            ? "Drag Team Leaders into a Senior Team Leader card to build or reorganize teams."
            : isSTL
              ? "Your team — Team Leaders assigned to you by Operations."
              : "Team Leaders assigned to Senior Team Leaders."}
        </Text>
      </div>
      {canBuildTeams ? <STLTeamBuilderDnDView /> : <STLTeamHierarchyView />}
    </>
  );
}
