"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "@/components/shared/GlobalSearch";
import { useAgentTour } from "@/context/AgentTourContext";
import { QuestionCircleOutlined } from "@ant-design/icons";

export default function AgentHeader() {
  const { startTour } = useAgentTour();

  return (
    <CrmHeader
      roleLabel="Agent"
      fallbackName="Agent"
      profilePath="/agent/profile"
      search={<GlobalSearch />}
      additionalMenuItems={[
        {
          key: "help",
          icon: <QuestionCircleOutlined />,
          label: "Help",
          children: [{ key: "product-tour", label: "Product Tour" }],
        },
      ]}
      onProductTourClick={startTour}
    />
  );
}
