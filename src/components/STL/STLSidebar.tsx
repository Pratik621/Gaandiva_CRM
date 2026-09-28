"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  BarChartOutlined,
  BellOutlined,
  DashboardOutlined,
  DollarOutlined,
  SolutionOutlined,
  FundProjectionScreenOutlined,
  HistoryOutlined,
  SearchOutlined,
  TeamOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import CrmSidebar, { type CrmSidebarItem } from "@/components/shared/CrmSidebar";
import { resolveSidebarSelectedKey } from "@/lib/sidebar-utils";

const stlDashboardItem: CrmSidebarItem = {
  key: "/stl/dashboard",
  icon: <DashboardOutlined />,
  label: "Dashboard",
  href: "/stl/dashboard",
};

const checkDataMenuItem: CrmSidebarItem = {
  key: "/stl/check-data",
  icon: <DatabaseOutlined />,
  label: "Check Data",
  href: "/stl/check-data",
};

/** Lead Finder — available to the STL area. */
const leadFinderMenuItem: CrmSidebarItem = {
  key: "/stl/lead-finder",
  icon: <SearchOutlined />,
  label: "Lead Finder",
  href: "/stl/lead-finder",
};

const stlSeniorTeamLeaderItems: CrmSidebarItem[] = [
  stlDashboardItem,
  {
    key: "/stl/campaigns",
    icon: <FundProjectionScreenOutlined />,
    label: "Campaigns",
    href: "/stl/campaigns",
  },
  {
    key: "/stl/announcements",
    icon: <BellOutlined />,
    label: "Announcements",
    href: "/stl/announcements",
  },
  { key: "/stl/leads", icon: <SolutionOutlined />, label: "Leads", href: "/stl/leads" },
  { key: "/stl/team", icon: <TeamOutlined />, label: "Team", href: "/stl/team" },
  {
    key: "/stl/team-performance",
    icon: <BarChartOutlined />,
    label: "Performance",
    href: "/stl/team-performance",
  },
  // {
  //   key: "/stl/revenue-report",
  //   icon: <DollarOutlined />,
  //   label: "Revenue",
  //   href: "/stl/revenue-report",
  // },
  {
    key: "/stl/reports",
    icon: <BarChartOutlined />,
    label: "Reports",
    href: "/stl/reports",
  },
  {
    key: "/stl/lead-transfer-history",
    icon: <HistoryOutlined />,
    label: "Transfers",
    href: "/stl/lead-transfer-history",
  },
];

export default function STLSidebar() {
  const pathname = usePathname();
  const { hasRole } = useAuth();
  const isOm = hasRole("operations_manager");

  const sections = useMemo(() => {
    const withLeadFinder = (items: CrmSidebarItem[]) => [...items, leadFinderMenuItem];
    const withCheckData = (items: CrmSidebarItem[]) =>
      isOm ? [...items, checkDataMenuItem] : items;

    return [withCheckData(withLeadFinder(stlSeniorTeamLeaderItems))];
  }, [isOm]);

  const allItems = useMemo(() => sections.flat(), [sections]);

  const selectedKey = resolveSidebarSelectedKey(pathname, allItems, "/stl/dashboard");

  return <CrmSidebar sections={sections} selectedKey={selectedKey} />;
}
