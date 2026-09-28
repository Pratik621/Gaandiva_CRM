"use client";

import { usePathname } from "next/navigation";
import { FundProjectionScreenOutlined, DashboardOutlined, AudioOutlined, BellOutlined } from "@ant-design/icons";
import CrmSidebar, { type CrmSidebarItem } from "@/components/shared/CrmSidebar";
import { resolveSidebarSelectedKey } from "@/lib/sidebar-utils";

const menuItems: CrmSidebarItem[] = [
  { key: "/qa/dashboard", icon: <DashboardOutlined />, label: "Dashboard", href: "/qa/dashboard" },
  { key: "/qa/campaigns", icon: <FundProjectionScreenOutlined />, label: "Campaigns", href: "/qa/campaigns" },
  { key: "/qa/announcements", icon: <BellOutlined />, label: "Announcements", href: "/qa/announcements" },
  { key: "/qa/recordings", icon: <AudioOutlined />, label: "Recordings", href: "/qa/recordings" },
];

export default function QASidebar() {
  const pathname = usePathname();
  const selectedKey = resolveSidebarSelectedKey(pathname, menuItems, "/qa/dashboard");

  return <CrmSidebar sections={[menuItems]} selectedKey={selectedKey} activeAccent="purple" />;
}
