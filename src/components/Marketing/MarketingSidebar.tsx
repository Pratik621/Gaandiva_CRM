"use client";

import { usePathname } from "next/navigation";
import { DashboardOutlined, FundProjectionScreenOutlined } from "@ant-design/icons";
import CrmSidebar, { type CrmSidebarItem } from "@/components/shared/CrmSidebar";
import { resolveSidebarSelectedKey } from "@/lib/sidebar-utils";

const marketingMenuItems: CrmSidebarItem[] = [
  { key: "/marketing/dashboard", icon: <DashboardOutlined />, label: "Dashboard", href: "/marketing/dashboard" },
  { key: "/marketing/campaigns", icon: <FundProjectionScreenOutlined />, label: "Campaign", href: "/marketing/campaigns" },
];

export default function MarketingSidebar() {
  const pathname = usePathname();
  const selectedKey = resolveSidebarSelectedKey(pathname, marketingMenuItems, "/marketing/dashboard");

  return <CrmSidebar sections={[marketingMenuItems]} selectedKey={selectedKey} />;
}
