"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SalesClientsAddRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/sales/clients");
  }, [router]);
  return null;
}
