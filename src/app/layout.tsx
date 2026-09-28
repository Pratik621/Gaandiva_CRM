import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";
import { AuthProvider } from "@/context/AuthContext";
import { antdThemeColors } from "@/design-tokens";
import { Providers } from "./providers";
import "./globals.css";

const theme = {
  token: {
    colorPrimary: antdThemeColors.colorPrimary,
    colorSuccess: antdThemeColors.colorSuccess,
    colorWarning: antdThemeColors.colorWarning,
    colorError: antdThemeColors.colorError,
    borderRadius: 8,
    fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
    fontSizeHeading1: 24,
    fontSizeHeading2: 18,
    fontSizeSM: 12,
  },
  components: {
    Layout: {
      headerBg: "#ffffff",
      headerHeight: 64,
      headerPadding: "0 24px",
      siderBg: "#001529",
      bodyBg: "#f5f5f5",
    },
  },
};

export const metadata: Metadata = {
  title: "CRM Dashboard | Professional Pipeline Management",
  description: "Clean and professional CRM dashboard",
  icons: {
    icon: "/projects/sidebar_logo.png",
    shortcut: "/projects/sidebar_logo.png",
    apple: "/projects/sidebar_logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AntdRegistry>
          <ConfigProvider theme={theme}>
            <Providers>
              <AuthProvider>{children}</AuthProvider>
            </Providers>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
