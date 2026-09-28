"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  DashboardOutlined,
  TeamOutlined,
  ProjectOutlined,
  FileTextOutlined,
  BarChartOutlined,
  SettingOutlined,
  CustomerServiceOutlined,
  FundProjectionScreenOutlined,
  SolutionOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { COMMAND_CENTER_ROLES } from "@/lib/auth/config";
import CrmSidebar, { type CrmSidebarItem } from "@/components/shared/CrmSidebar";
import { resolveSidebarSelectedKey } from "@/lib/sidebar-utils";

const salesMenuItems: CrmSidebarItem[] = [
  { key: "/sales/dashboard", icon: <DashboardOutlined />, label: "Dashboard", href: "/sales/dashboard" },
  { key: "/sales/contacts", icon: <TeamOutlined />, label: "Contacts", href: "/sales/contacts" },
  { key: "/sales/campaigns", icon: <FundProjectionScreenOutlined />, label: "Campaigns", href: "/sales/campaigns" },
  { key: "/sales/deals", icon: <ProjectOutlined />, label: "Deals", href: "/sales/deals" },
  { key: "/sales/accounts", icon: <CustomerServiceOutlined />, label: "Companies", href: "/sales/accounts" },
  { key: "/sales/activities", icon: <FileTextOutlined />, label: "Activities", href: "/sales/activities" },
  { key: "/sales/settings", icon: <SettingOutlined />, label: "Settings", href: "/sales/settings" },
];

/** Command center + client_viewer menu (/dashboard/*). */
const commandMenuItems: CrmSidebarItem[] = [
  { key: "/dashboard/overview", icon: <DashboardOutlined />, label: "Overview", href: "/dashboard/overview" },
  { key: "/dashboard/campaigns", icon: <FundProjectionScreenOutlined />, label: "Campaigns", href: "/dashboard/campaigns" },
  { key: "/dashboard/leads", icon: <SolutionOutlined />, label: "Leads", href: "/dashboard/leads" },
];

/** client_viewer lands on campaigns — campaigns first in the rail. */
const clientViewerMenuItems: CrmSidebarItem[] = [
  { key: "/dashboard/campaigns", icon: <FundProjectionScreenOutlined />, label: "Campaigns", href: "/dashboard/campaigns" },
  { key: "/dashboard/leads", icon: <SolutionOutlined />, label: "Leads", href: "/dashboard/leads" },
  { key: "/dashboard/overview", icon: <DashboardOutlined />, label: "Overview", href: "/dashboard/overview" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { hasRole } = useAuth();

  const isClientViewer = hasRole("client_viewer");
  const isAdminUser = hasRole("admin");
  const isCommandCenterUser = COMMAND_CENTER_ROLES.some((role) => hasRole(role));
  const onDashboardSection = Boolean(pathname?.startsWith("/dashboard"));

  const visibleMenuItems = useMemo(() => {
    if (isClientViewer && !isAdminUser) return clientViewerMenuItems;
    if (isCommandCenterUser || onDashboardSection) return commandMenuItems;
    return salesMenuItems;
  }, [isClientViewer, isAdminUser, isCommandCenterUser, onDashboardSection]);

  const selectedKey = useMemo(
    () => resolveSidebarSelectedKey(pathname, visibleMenuItems, visibleMenuItems[0]?.key ?? "/"),
    [pathname, visibleMenuItems]
  );

  return <CrmSidebar sections={[visibleMenuItems]} selectedKey={selectedKey} />;
}
