"use client";

import { usePathname } from "next/navigation";
import {
  DashboardOutlined,
  FundProjectionScreenOutlined,
  SolutionOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import CrmSidebar, { type CrmSidebarItem } from "@/components/shared/CrmSidebar";
import { resolveSidebarSelectedKey } from "@/lib/sidebar-utils";

const menuItems: CrmSidebarItem[] = [
  { key: "/emm/dashboard", icon: <DashboardOutlined />, label: "Dashboard", href: "/emm/dashboard" },
  {
    key: "/emm/lead-finder",
    icon: <SearchOutlined />,
    label: "Lead Finder",
    href: "/emm/lead-finder",
  },
  {
    key: "/emm/campaigns",
    icon: <FundProjectionScreenOutlined />,
    label: "Campaigns",
    href: "/emm/campaigns",
  },
  { key: "/emm/leads", icon: <SolutionOutlined />, label: "Leads", href: "/emm/leads" },
];

export default function EMMSidebar() {
  const pathname = usePathname();
  const selectedKey = resolveSidebarSelectedKey(pathname, menuItems, "/emm/dashboard");

  return <CrmSidebar sections={[menuItems]} selectedKey={selectedKey} />;
}
