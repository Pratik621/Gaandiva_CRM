"use client";

import Link from "next/link";
import { Button, Result, Space, Typography } from "antd";

const { Text } = Typography;

export default function NotFound() {
  return (
    <div style={{ padding: 24 }}>
      <Result
        status="404"
        title="Page not found"
        subTitle={
          <Text type="secondary">
            The page you’re looking for doesn’t exist or was moved.
          </Text>
        }
        extra={
          <Space>
            <Link href="/sales" prefetch={false}>
              <Button>Go to Sales</Button>
            </Link>
            <Link href="/login" prefetch={false}>
              <Button type="primary">Login</Button>
            </Link>
          </Space>
        }
      />
    </div>
  );
}

