"use client";

import { usePathname } from "next/navigation";
import { DashboardOutlined, PhoneOutlined } from "@ant-design/icons";
import CrmSidebar, { type CrmSidebarItem } from "@/components/shared/CrmSidebar";
import { resolveSidebarSelectedKey } from "@/lib/sidebar-utils";

const smAgentMenuItems: CrmSidebarItem[] = [
  { key: "/sm-agent/dashboard", icon: <DashboardOutlined />, label: "Dashboard", href: "/sm-agent/dashboard" },
  { key: "/sm-agent/leads", icon: <PhoneOutlined />, label: "Leads", href: "/sm-agent/leads" },
];

export default function SmAgentSidebar() {
  const pathname = usePathname();
  const selectedKey = resolveSidebarSelectedKey(pathname, smAgentMenuItems, "/sm-agent/dashboard");

  return <CrmSidebar sections={[smAgentMenuItems]} selectedKey={selectedKey} />;
}
