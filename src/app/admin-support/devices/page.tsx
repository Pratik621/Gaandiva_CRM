"use client";

import { Suspense } from "react";
import { Spin } from "antd";
import AdminDevicesPage from "@/app/admin/devices/AdminDevicesClient";

export default function AdminSupportDevicesPage() {
  return <Suspense fallback={<div className="p-6 flex justify-center"><Spin /></div>}><AdminDevicesPage /></Suspense>;
}
