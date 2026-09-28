"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  BarChartOutlined,
  BellOutlined,
  SearchOutlined,
  SafetyCertificateFilled,
  DashboardOutlined,
  DesktopOutlined,
  DollarOutlined,
  SolutionOutlined,
  FundProjectionScreenOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import CrmSidebar, { type CrmSidebarItem } from "@/components/shared/CrmSidebar";
import { resolveSidebarSelectedKey } from "@/lib/sidebar-utils";
import { useDevicePendingCount } from "@/hooks/useDevicePendingCount";

const omMenuItems: CrmSidebarItem[] = [
  { key: "/admin/team-performance", icon: <BarChartOutlined />, label: "Performance", href: "/admin/team-performance" },
  { key: "/admin/revenue-report", icon: <DollarOutlined />, label: "Revenue", href: "/admin/revenue-report" },
  { key: "/admin/team", icon: <TeamOutlined />, label: "Team", href: "/admin/team" },
  { key: "/admin/campaigns", icon: <FundProjectionScreenOutlined />, label: "Campaigns", href: "/admin/campaigns" },
  { key: "/admin/leads", icon: <SolutionOutlined />, label: "Leads", href: "/admin/leads" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const { hasRole } = useAuth();
  const showOmNav = hasRole("operations_manager") || hasRole("admin");
  const isAdmin = hasRole("admin");
  const { pendingCount } = useDevicePendingCount(isAdmin);

  const adminMenuItems: CrmSidebarItem[] = useMemo(
    () => [
      { key: "/admin/dashboard", icon: <DashboardOutlined />, label: "Dashboard", href: "/admin/dashboard" },
      { key: "/admin/announcements", icon: <BellOutlined />, label: "Announcements", href: "/admin/announcements" },
      ...(isAdmin
        ? [
            {
              key: "/admin/lead-finder",
              icon: <SearchOutlined />,
              label: "Lead Finder",
              href: "/admin/lead-finder",
            } satisfies CrmSidebarItem,
          ]
        : []),
      { key: "/admin/audit-logs", icon: <SafetyCertificateFilled />, label: "Audit Logs", href: "/admin/audit-logs" },
      { key: "/admin/sales", icon: <DollarOutlined />, label: "Sales", href: "/admin/sales" },
      { key: "/admin/users", icon: <UserOutlined />, label: "Users", href: "/admin/users" },
      {
        key: "/admin/devices",
        icon: <DesktopOutlined />,
        label: "Devices",
        href: "/admin/devices",
        badge: pendingCount,
      },
      { key: "/admin/roles", icon: <SafetyCertificateOutlined />, label: "Roles", href: "/admin/roles" },
      { key: "/admin/settings", icon: <SettingOutlined />, label: "Settings", href: "/admin/settings" },
    ],
    [pendingCount, isAdmin]
  );

  const sections = useMemo(
    () => (showOmNav ? [adminMenuItems, omMenuItems] : [adminMenuItems]),
    [adminMenuItems, showOmNav]
  );

  const allItems = useMemo(
    () => (showOmNav ? [...adminMenuItems, ...omMenuItems] : adminMenuItems),
    [adminMenuItems, showOmNav]
  );

  const selectedKey = resolveSidebarSelectedKey(pathname, allItems, "/admin/dashboard");

  return (
    <CrmSidebar
      sections={sections}
      selectedKey={selectedKey}
      siderClassName="admin-sidebar-sider"
    />
  );
}
