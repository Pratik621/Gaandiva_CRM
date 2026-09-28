"use client";

import { Suspense } from "react";
import { Spin } from "antd";
import AdminDevicesPage from "./AdminDevicesClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-6 flex justify-center">
          <Spin />
        </div>
      }
    >
      <AdminDevicesPage />
    </Suspense>
  );
}
