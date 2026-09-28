"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  DollarOutlined,
  FundProjectionScreenOutlined,
  TeamOutlined,
  SolutionOutlined,
  ApartmentOutlined,
  ProjectOutlined,
  ScheduleOutlined,
  BarChartOutlined,
  SettingOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  BellOutlined,
} from "@ant-design/icons";
import { IconMessage2 } from "@tabler/icons-react";
import { useAuth } from "@/context/AuthContext";
import CrmSidebar, { type CrmSidebarItem } from "@/components/shared/CrmSidebar";
import { resolveSidebarSelectedKey } from "@/lib/sidebar-utils";

const commonMenuItems: CrmSidebarItem[] = [
  { key: "/sales/clients", icon: <TeamOutlined />, label: "Clients", href: "/sales/clients" },
  { key: "/sales/campaigns", icon: <FundProjectionScreenOutlined />, label: "Campaigns", href: "/sales/campaigns" },
  { key: "/sales/announcements", icon: <BellOutlined />, label: "Announcements", href: "/sales/announcements" },
  { key: "/sales/leads", icon: <SolutionOutlined />, label: "Sales Leads", href: "/sales/leads" },
  { key: "/sales/all-leads", icon: <SolutionOutlined />, label: "Leads", href: "/sales/all-leads" },
  { key: "/sales/contacts", icon: <TeamOutlined />, label: "Contacts", href: "/sales/contacts" },
  { key: "/sales/accounts", icon: <ApartmentOutlined />, label: "Accounts", href: "/sales/accounts" },
  { key: "/sales/deals", icon: <ProjectOutlined />, label: "Deals", href: "/sales/deals" },
  { key: "/sales/activities", icon: <ScheduleOutlined />, label: "Activities", href: "/sales/activities" },
  { key: "/sales/tasks", icon: <ScheduleOutlined />, label: "Follow-ups", href: "/sales/tasks" },
  { key: "/sales/settings", icon: <SettingOutlined />, label: "Settings", href: "/sales/settings" },
];

const managerInsightItems: CrmSidebarItem[] = [
  { key: "/sales/team-performance", icon: <BarChartOutlined />, label: "Performance", href: "/sales/team-performance" },
  { key: "/sales/revenue-report", icon: <DollarOutlined />, label: "Revenue", href: "/sales/revenue-report" },
  { key: "/sales/reports", icon: <BarChartOutlined />, label: "Reports", href: "/sales/reports" },
];

const checkDataMenuItem: CrmSidebarItem = {
  key: "/sales/check-data",
  icon: <DatabaseOutlined />,
  label: "Check Data",
  href: "/sales/check-data",
};

export default function SalesSidebar() {
  const pathname = usePathname();
  const { hasRole } = useAuth();

  const isSalesManager = hasRole("sales_manager") || hasRole("admin");
  const isSalesOnly = hasRole("sales") && !isSalesManager;
  const canAccessCheckData = hasRole("sales_manager");

  const filteredCommon = useMemo(
    () =>
      commonMenuItems.filter((item) => {
        if (!isSalesOnly) return true;
        return item.key !== "/sales/clients";
      }),
    [isSalesOnly]
  );

  const sections = useMemo(() => {
    const dashboardItem: CrmSidebarItem = isSalesManager
      ? { key: "/sales/dashboard", icon: <DashboardOutlined />, label: "Dashboard", href: "/sales/dashboard" }
      : { key: "/sales", icon: <DollarOutlined />, label: "Dashboard", href: "/sales" };

    const chatItem: CrmSidebarItem = {
      key: "/sales/chat",
      icon: <IconMessage2 size={18} stroke={1.75} />,
      label: "Chat",
      href: "/sales/chat",
      accent: "emerald",
      prefetch: false,
    };

    const primary: CrmSidebarItem[] = [dashboardItem, chatItem];
    if (isSalesManager) primary.push(...managerInsightItems);
    if (canAccessCheckData) primary.push(checkDataMenuItem);
    return [primary, filteredCommon];
  }, [filteredCommon, isSalesManager, canAccessCheckData]);

  const allItems = useMemo(() => sections.flat(), [sections]);

  const selectedKey = resolveSidebarSelectedKey(
    pathname,
    allItems,
    isSalesManager ? "/sales/dashboard" : "/sales"
  );

  return <CrmSidebar sections={sections} selectedKey={selectedKey} />;
}
