"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { DesktopOutlined, SettingOutlined, UserOutlined } from "@ant-design/icons";
import CrmSidebar, { type CrmSidebarItem } from "@/components/shared/CrmSidebar";
import { resolveSidebarSelectedKey } from "@/lib/sidebar-utils";
import { useDevicePendingCount } from "@/hooks/useDevicePendingCount";

const items: CrmSidebarItem[] = [
  { key: "/admin-support/users", icon: <UserOutlined />, label: "Users", href: "/admin-support/users" },
  { key: "/admin-support/devices", icon: <DesktopOutlined />, label: "Devices", href: "/admin-support/devices" },
  { key: "/admin-support/settings", icon: <SettingOutlined />, label: "Settings", href: "/admin-support/settings" },
];

export default function AdminSupportSidebar() {
  const pathname = usePathname();
  const { pendingCount } = useDevicePendingCount(true);
  const menuItems = useMemo(
    () => items.map((item) => item.key === "/admin-support/devices" ? { ...item, badge: pendingCount } : item),
    [pendingCount]
  );

  return <CrmSidebar sections={[menuItems]} selectedKey={resolveSidebarSelectedKey(pathname, menuItems, "/admin-support/users")} siderClassName="admin-sidebar-sider" />;
}
