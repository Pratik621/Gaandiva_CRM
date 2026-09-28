"use client";

import { usePathname } from "next/navigation";
import { BellOutlined, DashboardOutlined, FundProjectionScreenOutlined, PhoneOutlined, SolutionOutlined } from "@ant-design/icons";
import CrmSidebar, { type CrmSidebarItem } from "@/components/shared/CrmSidebar";
import { resolveSidebarSelectedKey } from "@/lib/sidebar-utils";

const agentMenuItems: CrmSidebarItem[] = [
  { key: "/agent/dashboard", icon: <DashboardOutlined />, label: "Dashboard", href: "/agent/dashboard" },
  { key: "/agent/campaigns", icon: <FundProjectionScreenOutlined />, label: "Campaigns", href: "/agent/campaigns", dataTourId: "agent-sidebar-campaigns" },
  { key: "/agent/announcements", icon: <BellOutlined />, label: "Announcements", href: "/agent/announcements" },
  { key: "/agent/leads", icon: <SolutionOutlined />, label: "Leads", href: "/agent/leads" },
  { key: "/agent/call-logs", icon: <PhoneOutlined />, label: "Call Logs", href: "/agent/call-logs" },
];

export default function AgentSidebar() {
  const pathname = usePathname();
  const selectedKey = resolveSidebarSelectedKey(pathname, agentMenuItems, "/agent/dashboard");

  return <CrmSidebar sections={[agentMenuItems]} selectedKey={selectedKey} />;
}
