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
  AudioOutlined,
} from "@ant-design/icons";
import CrmSidebar, { type CrmSidebarItem } from "@/components/shared/CrmSidebar";
import { resolveSidebarSelectedKey } from "@/lib/sidebar-utils";

const qatlMenuItems: CrmSidebarItem[] = [
  { key: "/qatl/dashboard", icon: <DashboardOutlined />, label: "Dashboard", href: "/qatl/dashboard" },
  { key: "/qatl/campaigns", icon: <FundProjectionScreenOutlined />, label: "Campaigns", href: "/qatl/campaigns" },
  { key: "/qatl/announcements", icon: <BellOutlined />, label: "Announcements", href: "/qatl/announcements" },
  { key: "/qatl/campaign-tracker", icon: <AimOutlined />, label: "Camp Tracker", href: "/qatl/campaign-tracker" },
  { key: "/qatl/lead-upload", icon: <CloudUploadOutlined />, label: "Lead Upload", href: "/qatl/lead-upload" },
  { key: "/qatl/leads", icon: <SolutionOutlined />, label: "Leads", href: "/qatl/leads" },
  { key: "/qatl/reports", icon: <BarChartOutlined />, label: "Reports", href: "/qatl/reports" },
  { key: "/qatl/recordings", icon: <AudioOutlined />, label: "Recordings", href: "/qatl/recordings" },
];

export default function QATLSidebar() {
  const pathname = usePathname();
  const selectedKey = resolveSidebarSelectedKey(pathname, qatlMenuItems, "/qatl/dashboard");

  return <CrmSidebar sections={[qatlMenuItems]} selectedKey={selectedKey} />;
}
