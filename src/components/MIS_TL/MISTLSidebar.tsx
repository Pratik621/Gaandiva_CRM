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

const mistlMenuItems: CrmSidebarItem[] = [
  { key: "/mistl/dashboard", icon: <DashboardOutlined />, label: "Dashboard", href: "/mistl/dashboard" },
  { key: "/mistl/campaigns", icon: <FundProjectionScreenOutlined />, label: "Campaigns", href: "/mistl/campaigns" },
  { key: "/mistl/announcements", icon: <BellOutlined />, label: "Announcements", href: "/mistl/announcements" },
  { key: "/mistl/campaign-tracker", icon: <AimOutlined />, label: "Camp Tracker", href: "/mistl/campaign-tracker" },
  { key: "/mistl/lead-upload", icon: <CloudUploadOutlined />, label: "Lead Upload", href: "/mistl/lead-upload" },
  { key: "/mistl/leads", icon: <SolutionOutlined />, label: "Leads", href: "/mistl/leads" },
  { key: "/mistl/reports", icon: <BarChartOutlined />, label: "Reports", href: "/mistl/reports" },
];

export default function MISTLSidebar() {
  const pathname = usePathname();
  const selectedKey = resolveSidebarSelectedKey(pathname, mistlMenuItems, "/mistl/dashboard");

  return <CrmSidebar sections={[mistlMenuItems]} selectedKey={selectedKey} />;
}
