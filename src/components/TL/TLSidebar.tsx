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

const tlDashboardItem: CrmSidebarItem = {
  key: "/tl/dashboard",
  icon: <DashboardOutlined />,
  label: "Dashboard",
  href: "/tl/dashboard",
};

const omDashboardItem: CrmSidebarItem = {
  key: "/om/dashboard",
  icon: <DashboardOutlined />,
  label: "Dashboard",
  href: "/om/dashboard",
};

/** OM-only — jumps into the Senior Team Leader area (separate route tree). */
const seniorTeamLeadersMenuItem: CrmSidebarItem = {
  key: "/stl/dashboard",
  icon: <TeamOutlined />,
  label: "Senior Team Leaders",
  href: "/stl/dashboard",
};

/** OM org-wide tools — mirrors admin OM section, on /tl routes. */
const omInsightMenuItems: CrmSidebarItem[] = [
  {
    key: "/tl/team-performance",
    icon: <BarChartOutlined />,
    label: "Performance",
    href: "/tl/team-performance",
  },
  {
    key: "/tl/revenue-report",
    icon: <DollarOutlined />,
    label: "Revenue",
    href: "/tl/revenue-report",
  },
  {
    key: "/tl/reports",
    icon: <BarChartOutlined />,
    label: "Reports",
    href: "/tl/reports",
  },
  { key: "/tl/team", icon: <TeamOutlined />, label: "Team", href: "/tl/team" },
  {
    key: "/tl/campaigns",
    icon: <FundProjectionScreenOutlined />,
    label: "Campaigns",
    href: "/tl/campaigns",
  },
  {
    key: "/tl/announcements",
    icon: <BellOutlined />,
    label: "Announcements",
    href: "/tl/announcements",
  },
  { key: "/tl/leads", icon: <SolutionOutlined />, label: "Leads", href: "/tl/leads" },
  seniorTeamLeadersMenuItem,
];

const checkDataMenuItem: CrmSidebarItem = {
  key: "/tl/check-data",
  icon: <DatabaseOutlined />,
  label: "Check Data",
  href: "/tl/check-data",
};

/** Lead Finder — Admin (via /admin), OM, and TL (via /tl/lead-finder). */
const leadFinderMenuItem: CrmSidebarItem = {
  key: "/tl/lead-finder",
  icon: <SearchOutlined />,
  label: "Lead Finder",
  href: "/tl/lead-finder",
};

const tlCampaignLeaderItems: CrmSidebarItem[] = [
  tlDashboardItem,
  {
    key: "/tl/campaigns",
    icon: <FundProjectionScreenOutlined />,
    label: "Campaigns",
    href: "/tl/campaigns",
  },
  {
    key: "/tl/announcements",
    icon: <BellOutlined />,
    label: "Announcements",
    href: "/tl/announcements",
  },
  { key: "/tl/leads", icon: <SolutionOutlined />, label: "Leads", href: "/tl/leads" },
  { key: "/tl/team", icon: <TeamOutlined />, label: "Team", href: "/tl/team" },
  {
    key: "/tl/team-performance",
    icon: <BarChartOutlined />,
    label: "Performance",
    href: "/tl/team-performance",
  },
  {
    key: "/tl/lead-transfer-history",
    icon: <HistoryOutlined />,
    label: "Transfers",
    href: "/tl/lead-transfer-history",
  },
];

const omRevenueOnly: CrmSidebarItem[] = [
  {
    key: "/tl/reports",
    icon: <BarChartOutlined />,
    label: "Reports",
    href: "/tl/reports",
  },
  {
    key: "/tl/revenue-report",
    icon: <DollarOutlined />,
    label: "Revenue",
    href: "/tl/revenue-report",
  },
  seniorTeamLeadersMenuItem,
];

export default function TLSidebar() {
  const pathname = usePathname();
  const { hasRole } = useAuth();
  const isOm = hasRole("operations_manager");
  const isCampaignTl = hasRole("team_leader") || hasRole("tl");

  const sections = useMemo(() => {
    const withLeadFinder = (items: CrmSidebarItem[]) => [...items, leadFinderMenuItem];
    const withCheckData = (items: CrmSidebarItem[]) =>
      isOm ? [...items, checkDataMenuItem] : items;

    const dashboardItem = isOm ? omDashboardItem : tlDashboardItem;
    const tlItemsWithDashboard = tlCampaignLeaderItems.map((item) =>
      item.key === "/tl/dashboard" ? dashboardItem : item
    );

    if (isOm && !isCampaignTl) {
      return [[dashboardItem], withCheckData(withLeadFinder(omInsightMenuItems))];
    }
    if (isOm && isCampaignTl) {
      return [withCheckData(withLeadFinder(tlItemsWithDashboard)), omRevenueOnly];
    }
    if (isCampaignTl) {
      return [withLeadFinder(tlCampaignLeaderItems)];
    }
    return [[tlDashboardItem], omInsightMenuItems];
  }, [isOm, isCampaignTl]);

  const allItems = useMemo(() => sections.flat(), [sections]);

  const selectedKey = resolveSidebarSelectedKey(
    pathname,
    allItems,
    isOm ? "/om/dashboard" : "/tl/dashboard"
  );

  return <CrmSidebar sections={sections} selectedKey={selectedKey} />;
}
