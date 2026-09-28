"use client";

import { usePathname } from "next/navigation";
import { DashboardOutlined, FundProjectionScreenOutlined } from "@ant-design/icons";
import CrmSidebar, { type CrmSidebarItem } from "@/components/shared/CrmSidebar";
import { resolveSidebarSelectedKey } from "@/lib/sidebar-utils";

const menuItems: CrmSidebarItem[] = [
  { key: "/dc/dashboard", icon: <DashboardOutlined />, label: "Dashboard", href: "/dc/dashboard" },
  { key: "/dc/campaigns", icon: <FundProjectionScreenOutlined />, label: "Campaigns", href: "/dc/campaigns" },
];

export default function DCSidebar() {
  const pathname = usePathname();
  const selectedKey = resolveSidebarSelectedKey(pathname, menuItems, "/dc/dashboard");

  return <CrmSidebar sections={[menuItems]} selectedKey={selectedKey} />;
}
