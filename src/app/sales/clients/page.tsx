"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dayjs from "dayjs";
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Button,
  Drawer,
  Input,
  Tag,
  Typography,
  Spin,
  message,
  Popconfirm,
  Space,
} from "antd";
import {
  UserOutlined,
  TeamOutlined,
  FundProjectionScreenOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { AddClientForm } from "@/components/Sales/AddClientForm";
import { Form } from "antd";

type CampaignBrief = { id: string; campaign_id: string; name: string; status: string; start_date: string | null };

type ClientRow = {
  id: string;
  client_code: string | null;
  company_name: string;
  company_website: string | null;
  industry_type: string | null;
  company_size: string | null;
  year_established: number | null;
  company_address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  contact_person: string | null;
  contact_full_name: string | null;
  contact_designation: string | null;
  contact_work_email: string | null;
  contact_mobile: string | null;
  contact_linkedin: string | null;
  created_at: string;
  services_products_offered?: string | null;
  target_market?: string | null;
  target_geography?: string | null;
  current_revenue_range?: string | null;
  existing_crm?: boolean | null;
  existing_crm_which?: string | null;
  problem_solving?: string | null;
  services_looking_for?: string | null;
  budget_range?: string | null;
  expected_start_date?: string | null;
  campaigns?: CampaignBrief[];
};

export default function SalesClientsPage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();
  const hasSalesAccess = hasRole("sales_manager");
  const canManageClients = hasRole("sales_manager");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [clientsPage, setClientsPage] = useState(1);
  const [clientsPageSize, setClientsPageSize] = useState(10);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales/clients?withCampaigns=1", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setClients(data.clients ?? []);
      else message.error(data.error || "Failed to load clients");
    } catch {
      message.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    if (!hasSalesAccess) {
      router.replace("/login");
      return;
    }
    fetchData();
  }, [isInitialized, hasSalesAccess, router, fetchData]);

  useEffect(() => {
    setClientsPage(1);
  }, [search]);

  const handleAddSuccess = () => {
    setDrawerOpen(false);
    form.resetFields();
    fetchData();
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    form.resetFields();
  };

  useEffect(() => {
    if (!editDrawerOpen || !editingClient) return;
    editForm.setFieldsValue({
      client_code: editingClient.client_code,
      company_name: editingClient.company_name,
      company_website: editingClient.company_website,
      industry_type: editingClient.industry_type,
      company_size: editingClient.company_size,
      year_established: editingClient.year_established,
      company_address: editingClient.company_address,
      city: editingClient.city,
      state: editingClient.state,
      country: editingClient.country,
      contact_person: editingClient.contact_person,
      contact_full_name: editingClient.contact_full_name,
      contact_designation: editingClient.contact_designation,
      contact_work_email: editingClient.contact_work_email,
      contact_mobile: editingClient.contact_mobile,
      contact_linkedin: editingClient.contact_linkedin,
      services_products_offered: editingClient.services_products_offered,
      target_market: editingClient.target_market,
      target_geography: editingClient.target_geography,
      current_revenue_range: editingClient.current_revenue_range,
      existing_crm: editingClient.existing_crm,
      existing_crm_which: editingClient.existing_crm_which,
      problem_solving: editingClient.problem_solving,
      services_looking_for: editingClient.services_looking_for,
      budget_range: editingClient.budget_range,
      expected_start_date: editingClient.expected_start_date
        ? dayjs(editingClient.expected_start_date)
        : undefined,
    });
  }, [editDrawerOpen, editingClient, editForm]);

  const openEditDrawer = (record: ClientRow) => {
    setEditingClient(record);
    setEditDrawerOpen(true);
  };

  const closeEditDrawer = () => {
    setEditDrawerOpen(false);
    setEditingClient(null);
    editForm.resetFields();
  };

  const handleEditSuccess = () => {
    closeEditDrawer();
    fetchData();
  };

  const handleDeleteClient = async (record: ClientRow) => {
    try {
      setDeletingClientId(record.id);
      const res = await fetch(`/api/sales/clients/${record.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete client");
      }
      message.success("Client deleted successfully");
      fetchData();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to delete client");
    } finally {
      setDeletingClientId(null);
    }
  };

  if (!isInitialized) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!hasSalesAccess) {
    return null;
  }

  const totalCampaigns = clients.reduce((sum, c) => sum + (c.campaigns?.length ?? 0), 0);

  const q = search.trim().toLowerCase();
  const filteredClients = q
    ? clients.filter(
        (c) =>
          (c.contact_full_name ?? "").toLowerCase().includes(q) ||
          (c.contact_person ?? "").toLowerCase().includes(q) ||
          (c.company_name ?? "").toLowerCase().includes(q) ||
          (c.contact_work_email ?? "").toLowerCase().includes(q)
      )
    : clients;

  const renderText = (v: string | null | number | undefined) => (v != null && v !== "" ? String(v) : "—");

  const columns = [
    {
      title: "Sr. No.",
      key: "sr",
      width: 72,
      fixed: "left" as const,
      render: (_: unknown, __: ClientRow, index: number) =>
        (clientsPage - 1) * clientsPageSize + index + 1,
    },
    {
      title: "Client Code",
      dataIndex: "client_code",
      key: "client_code",
      width: 168,
      fixed: "left" as const,
      onCell: () => ({ className: "table-cell-client-code" }),
      render: (v: string | null) =>
        v ? (
          <span
            style={{
              fontFamily: "monospace",
              background: "#f0f0f0",
              padding: "2px 7px",
              borderRadius: 5,
              fontSize: 12,
              display: "inline-block",
              whiteSpace: "nowrap",
            }}
          >
            {v}
          </span>
        ) : (
          <span style={{ color: "#bbb" }}>—</span>
        ),
    },
    {
      title: "Client name",
      dataIndex: "company_name",
      key: "company_name",
      width: 160,
      ellipsis: true,
      fixed: "left" as const,
      render: (v: string) => renderText(v),
    },
    {
      title: "Contact person",
      dataIndex: "contact_full_name",
      key: "contact_full_name_fixed",
      width: 160,
      ellipsis: true,
      fixed: "left" as const,
      render: (v: string | null) => <span style={{ fontWeight: 600 }}>{v || "—"}</span>,
    },
    {
      title: "Company Website",
      dataIndex: "company_website",
      key: "company_website",
      width: 140,
      ellipsis: true,
      render: (v: string | null) => renderText(v),
    },
    {
      title: "Industry Type",
      dataIndex: "industry_type",
      key: "industry_type",
      width: 120,
      ellipsis: true,
      render: (v: string | null) => renderText(v),
    },
    {
      title: "Company Size",
      dataIndex: "company_size",
      key: "company_size",
      width: 100,
      render: (v: string | null) => renderText(v),
    },
    {
      title: "Year Est.",
      dataIndex: "year_established",
      key: "year_established",
      width: 88,
      render: (v: number | null) => renderText(v),
    },
    {
      title: "Company Address",
      dataIndex: "company_address",
      key: "company_address",
      width: 160,
      ellipsis: true,
      render: (v: string | null) => renderText(v),
    },
    {
      title: "City",
      dataIndex: "city",
      key: "city",
      width: 100,
      ellipsis: true,
      render: (v: string | null) => renderText(v),
    },
    {
      title: "State",
      dataIndex: "state",
      key: "state",
      width: 100,
      ellipsis: true,
      render: (v: string | null) => renderText(v),
    },
    {
      title: "Country",
      dataIndex: "country",
      key: "country",
      width: 110,
      ellipsis: true,
      render: (v: string | null) => renderText(v),
    },
    {
      title: "Primary contact",
      dataIndex: "contact_person",
      key: "contact_person",
      width: 120,
      ellipsis: true,
      render: (v: string | null) => renderText(v),
    },
    {
      title: "Designation",
      dataIndex: "contact_designation",
      key: "contact_designation",
      width: 120,
      ellipsis: true,
      render: (v: string | null) => renderText(v),
    },
    {
      title: "Work Email",
      dataIndex: "contact_work_email",
      key: "contact_work_email",
      width: 160,
      ellipsis: true,
      render: (v: string | null) => renderText(v),
    },
    {
      title: "Mobile",
      dataIndex: "contact_mobile",
      key: "contact_mobile",
      width: 120,
      render: (v: string | null) => renderText(v),
    },
    {
      title: "LinkedIn",
      dataIndex: "contact_linkedin",
      key: "contact_linkedin",
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v ? <a href={v} target="_blank" rel="noopener noreferrer">Link</a> : "—",
    },
    {
      title: "Campaigns",
      key: "campaigns_count",
      width: 96,
      render: (_: unknown, r: ClientRow) => <Tag color="blue">{r.campaigns?.length ?? 0}</Tag>,
    },
    {
      title: "Created",
      dataIndex: "created_at",
      key: "created_at",
      width: 110,
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
    {
      title: "Actions",
      key: "actions",
      fixed: "right" as const,
      width: 100,
      render: (_: unknown, record: ClientRow) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditDrawer(record)}
            disabled={!canManageClients}
          />
          <Popconfirm
            title="Delete client"
            description={`Delete ${record.company_name}? This cannot be undone.`}
            okText="Delete"
            okButtonProps={{ danger: true, loading: deletingClientId === record.id }}
            onConfirm={() => handleDeleteClient(record)}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={!canManageClients}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Clients
          </Typography.Title>
          <Typography.Text type="secondary">
            Manage clients and their campaigns
          </Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setDrawerOpen(true)}
          disabled={!canManageClients}
        >
          Add Client
        </Button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic
                  title="Total Clients"
                  value={clients.length}
                  prefix={<UserOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic
                  title="Total Campaigns (linked)"
                  value={totalCampaigns}
                  prefix={<FundProjectionScreenOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic
                  title="Avg Campaigns / Client"
                  value={clients.length ? (totalCampaigns / clients.length).toFixed(1) : 0}
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Col>
          </Row>

          <Card
            title={
              <Row align="middle" justify="space-between" wrap={false} style={{ gap: 12 }}>
                <span>
                  All Clients
                  {q && (
                    <Typography.Text type="secondary" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>
                      {filteredClients.length} of {clients.length}
                    </Typography.Text>
                  )}
                </span>
                <Input.Search
                  placeholder="Search by client name, contact person, primary contact, email…"
                  allowClear
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onSearch={(v) => setSearch(v)}
                  style={{ width: 300, fontWeight: 400 }}
                />
              </Row>
            }
            bodyStyle={{ overflowX: "auto" }}
          >
            <Table
              className="table-single-line"
              columns={columns}
              dataSource={filteredClients}
              rowKey="id"
              scroll={{ x: 2410 }}
              pagination={{
                current: clientsPage,
                pageSize: clientsPageSize,
                showSizeChanger: true,
                pageSizeOptions: ["10", "15", "25", "50"],
                showTotal: (t) => `Total ${t} clients`,
                onChange: (page, size) => {
                  setClientsPage(page);
                  setClientsPageSize(size);
                },
              }}
              locale={{ emptyText: "No clients yet. Click Add Client to create one." }}
              expandable={{
                expandedRowRender: (record: ClientRow) => {
                  const list = record.campaigns ?? [];
                  if (list.length === 0) {
                    return <div style={{ padding: "8px 0", color: "#999" }}>No campaigns linked yet.</div>;
                  }
                  return (
                    <div style={{ padding: "8px 0" }}>
                      <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 12, color: "#666" }}>Campaigns</div>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {list.map((c) => (
                          <li key={c.id} style={{ marginBottom: 4 }}>
                            <Link href={`/sales/campaigns/${c.id}`}>{c.name}</Link>
                            <Tag color={c.status === "active" ? "green" : c.status === "draft" ? "default" : "orange"} style={{ marginLeft: 8 }}>
                              {c.status}
                            </Tag>
                            {c.start_date && (
                              <span style={{ marginLeft: 8, fontSize: 12, color: "#999" }}>
                                Started {new Date(c.start_date).toLocaleDateString()}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                },
                rowExpandable: () => true,
              }}
            />
          </Card>
        </>
      )}

      <Drawer
        title="Add Client"
        placement="right"
        width={800}
        open={drawerOpen}
        onClose={closeDrawer}
        destroyOnClose
        styles={{ body: { paddingTop: 8 } }}
      >
        <AddClientForm
          form={form}
          onSuccess={handleAddSuccess}
          onCancel={closeDrawer}
          showCancel={true}
        />
      </Drawer>

      <Drawer
        title="Edit Client"
        placement="right"
        width={800}
        open={editDrawerOpen}
        onClose={closeEditDrawer}
        destroyOnClose
        styles={{ body: { paddingTop: 8 } }}
      >
        {editingClient ? (
          <AddClientForm
            key={editingClient.id}
            form={editForm}
            mode="edit"
            clientId={editingClient.id}
            onUpdateSuccess={handleEditSuccess}
            onCancel={closeEditDrawer}
            showCancel
          />
        ) : null}
      </Drawer>
    </>
  );
}
