"use client";

import { usePathname } from "next/navigation";
import {
  DashboardOutlined,
  FundProjectionScreenOutlined,
  CloudUploadOutlined,
  SolutionOutlined,
  BarChartOutlined,
  AimOutlined,
  BellOutlined,
} from "@ant-design/icons";
import CrmSidebar, { type CrmSidebarItem } from "@/components/shared/CrmSidebar";
import { resolveSidebarSelectedKey } from "@/lib/sidebar-utils";

const misMenuItems: CrmSidebarItem[] = [
  { key: "/mis/dashboard", icon: <DashboardOutlined />, label: "Dashboard", href: "/mis/dashboard" },
  { key: "/mis/campaigns", icon: <FundProjectionScreenOutlined />, label: "Campaigns", href: "/mis/campaigns" },
  { key: "/mis/announcements", icon: <BellOutlined />, label: "Announcements", href: "/mis/announcements" },
  { key: "/mis/campaign-tracker", icon: <AimOutlined />, label: "Camp Tracker", href: "/mis/campaign-tracker" },
  { key: "/mis/lead-upload", icon: <CloudUploadOutlined />, label: "Lead Upload", href: "/mis/lead-upload" },
  { key: "/mis/leads", icon: <SolutionOutlined />, label: "Leads", href: "/mis/leads" },
  // { key: "/mis/reports", icon: <BarChartOutlined />, label: "Reports", href: "/mis/reports" },
];

export default function MISSidebar() {
  const pathname = usePathname();
  const selectedKey = resolveSidebarSelectedKey(pathname, misMenuItems, "/mis/dashboard");

  return <CrmSidebar sections={[misMenuItems]} selectedKey={selectedKey} />;
}
