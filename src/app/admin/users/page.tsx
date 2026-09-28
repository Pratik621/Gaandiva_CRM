"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Tooltip,
  message,
  Spin,
  Typography,
  Divider,
  Row,
  Col,
} from "antd";
import {
  EditOutlined,
  StopOutlined,
  UserAddOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import AdminUserStats from "@/components/Admin/AdminUserStats";
import { AdminMfaRolloutCard } from "@/components/Admin/AdminMfaRolloutCard";
import ClientLogoUpload from "@/components/Admin/ClientLogoUpload";
import { roleRequiresClientBinding } from "@/lib/admin/client-binding-roles";
import type { Tables } from "@/types/database.types";

type UserRow = Tables<"users"> & {
  roles: { name: string }[];
};
type ClientOption = { id: string; name: string };
const ADMIN_ROLES = ["admin"];
const ADMIN_SUPPORT_ROLES = ["admin_support"];

export default function AdminUsersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const activeAllowedRoles = pathname.startsWith("/admin-support")
    ? ADMIN_SUPPORT_ROLES
    : ADMIN_ROLES;
  const { hasRole, profile, isInitialized } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Tables<"roles">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const currentPage = pagination.current;
  const pageSize = pagination.pageSize;
  const [searchQuery, setSearchQuery] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [createSelectedRoleName, setCreateSelectedRoleName] = useState<string>("");
  const [editSelectedRoleName, setEditSelectedRoleName] = useState<string>("");
  const createClientId = Form.useWatch("client_id", createForm);
  const editClientId = Form.useWatch("client_id", editForm);

  // Redirect if not admin
  useEffect(() => {
    if (!isInitialized) return;
    if (!activeAllowedRoles.some((role) => hasRole(role))) {
      router.replace("/login");
    }
  }, [activeAllowedRoles, isInitialized, hasRole, router]);

  const fetchUsersAndRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load users");
      }

      setUsers(data.users ?? []);
      setRoles(data.roles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
      message.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/clients", { credentials: "include" });
      const data = (await res.json()) as { clients?: ClientOption[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to load clients");
      setClients(data.clients ?? []);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load clients");
    }
  }, []);

  useEffect(() => {
    if (isInitialized && activeAllowedRoles.some((role) => hasRole(role))) {
      fetchUsersAndRoles();
      fetchClients();
    }
  }, [activeAllowedRoles, isInitialized, hasRole, fetchUsersAndRoles, fetchClients]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredUsers = useMemo(() => {
    if (!normalizedQuery) return users;

    return users.filter((user) => {
      const searchableFields = [
        user.full_name ?? "",
        user.email ?? "",
        user.department ?? "",
        user.designation ?? "",
        user.status ?? "",
        ...(user.roles?.map((role) => role.name ?? "") ?? []),
      ];

      return searchableFields.some((field) =>
        field.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [users, normalizedQuery]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
    if (currentPage > maxPage) {
      setPagination((prev) => ({ ...prev, current: maxPage }));
    }
  }, [filteredUsers.length, currentPage, pageSize]);

  const handleCreateUser = async () => {
    try {
      const values = await createForm.validateFields();
      setSubmitting(true);

      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          full_name: values.full_name,
          role_id: values.role_id || null,
          client_id: roleRequiresClientBinding(createSelectedRoleName)
            ? (values.client_id || null)
            : null,
          department: values.department || null,
          designation: values.designation || null,
          ...(createSelectedRoleName !== "client_viewer"
            ? {
                phone: values.phone || null,
                employee_id: values.employee_id || null,
              }
            : {}),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to create user");
      }

      message.success("User created successfully. They can login with email and password.");
      setCreateModalOpen(false);
      createForm.resetFields();
      fetchUsersAndRoles();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditUser = (record: UserRow) => {
    setSelectedUser(record);
    const currentRoleName = record.roles?.[0]?.name || "";
    const currentRoleId = roles.find((r) => r.name === currentRoleName)?.id;
    const normalizedRole = currentRoleName.toLowerCase().replace(/\s+/g, "_");
    setEditSelectedRoleName(normalizedRole);
    let clientId = record.client_id ?? undefined;
    if (!clientId && normalizedRole === "dc") {
      const dcClient = clients.find((c) => c.name.trim().toLowerCase() === "dc");
      if (dcClient) clientId = dcClient.id;
    }
    editForm.setFieldsValue({
      full_name: record.full_name,
      department: record.department,
      designation: record.designation,
      phone: record.phone,
      employee_id: record.employee_id,
      role_id: currentRoleId,
      client_id: clientId,
      new_password: "",
      confirm_password: "",
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedUser) return;
    try {
      const values = await editForm.validateFields();
      setSubmitting(true);

      const newPassword =
        typeof values.new_password === "string" ? values.new_password.trim() : "";

      const payload: Record<string, unknown> = {
        full_name: values.full_name || null,
        department: values.department || null,
        designation: values.designation || null,
        role_id: values.role_id || null,
        client_id: roleRequiresClientBinding(editSelectedRoleName)
          ? (values.client_id || null)
          : null,
      };
      if (editSelectedRoleName !== "client_viewer") {
        payload.phone = values.phone || null;
        payload.employee_id = values.employee_id || null;
      }
      if (newPassword) {
        payload.password = newPassword;
      }

      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update user");

      message.success(
        json.password_updated
          ? "User updated and password changed successfully"
          : "User updated successfully"
      );
      setEditModalOpen(false);
      setSelectedUser(null);
      editForm.resetFields();
      fetchUsersAndRoles();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = (record: UserRow) => {
    Modal.confirm({
      title: "Deactivate user?",
      content: `Are you sure you want to deactivate ${record.full_name || record.email}? They will no longer be able to sign in.`,
      okText: "Deactivate",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const res = await fetch(`/api/admin/users/${record.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ status: "inactive" }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Failed to deactivate");
          message.success("User deactivated");
          fetchUsersAndRoles();
        } catch (err) {
          message.error(err instanceof Error ? err.message : "Failed to deactivate");
        }
      },
    });
  };

  const handleActivate = async (record: UserRow) => {
    try {
      const res = await fetch(`/api/admin/users/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "active" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to activate");
      message.success("User activated");
      fetchUsersAndRoles();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to activate");
    }
  };

  const handleMfaReset = (record: UserRow) => {
    Modal.confirm({
      title: "Reset MFA for this user?",
      content: `This removes ${record.full_name || record.email}'s MFA factors and backup codes. They must set up MFA again on next login.`,
      okText: "Reset MFA",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const res = await fetch(`/api/admin/users/${record.id}/mfa-reset`, {
            method: "POST",
            credentials: "include",
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Failed to reset MFA");
          message.success("MFA reset — user must enroll again");
        } catch (err) {
          message.error(err instanceof Error ? err.message : "Failed to reset MFA");
        }
      },
    });
  };

  const handleDelete = (record: UserRow) => {
    Modal.confirm({
      title: "Delete user permanently?",
      content: `Are you sure you want to delete ${record.full_name || record.email}? This action cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const res = await fetch(`/api/admin/users/${record.id}`, {
            method: "DELETE",
            credentials: "include",
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Failed to delete user");
          message.success("User deleted");
          fetchUsersAndRoles();
        } catch (err) {
          message.error(err instanceof Error ? err.message : "Failed to delete user");
        }
      },
    });
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spin size="large" />
      </div>
    );
  }

  if (!activeAllowedRoles.some((role) => hasRole(role))) {
    return null;
  }

  const columns = [
    {
      title: "Sr. No",
      key: "sr",
      width: 80,
      render: (_: unknown, __: UserRow, index: number) =>
        (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: "Name",
      dataIndex: "full_name",
      key: "full_name",
      render: (val: string | null, r: UserRow) => val || r.email || "—",
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      render: (val: string | null) => val || "—",
    },
    {
      title: "Role",
      key: "role",
      render: (_: unknown, r: UserRow) =>
        r.roles?.length ? (
          <Space size={[0, 4]} wrap>
            {r.roles.map((role) => (
              <Tag key={role.name}>{role.name}</Tag>
            ))}
          </Space>
        ) : (
          "—"
        ),
    },
    {
      title: "Department",
      dataIndex: "department",
      key: "department",
      render: (val: string | null) => val || "—",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (val: string) => (
        <Tag color={val === "active" ? "green" : "default"}>{val}</Tag>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 180,
      render: (_: unknown, record: UserRow) => (
        <Space size="middle" style={{ transition: "opacity 0.2s ease" }}>
          <Tooltip title="Edit" placement="top" mouseEnterDelay={0.3}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditUser(record)}
              style={{ transition: "color 0.2s ease, opacity 0.2s ease" }}
            />
          </Tooltip>
          <Tooltip title="Reset MFA" placement="top" mouseEnterDelay={0.3}>
            <Button
              type="text"
              size="small"
              icon={<SafetyCertificateOutlined />}
              onClick={() => handleMfaReset(record)}
              style={{ transition: "color 0.2s ease, opacity 0.2s ease" }}
            />
          </Tooltip>
          {record.status === "active" ? (
            <Tooltip title="Deactivate" placement="top" mouseEnterDelay={0.3}>
              <Button
                type="text"
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => handleDeactivate(record)}
                style={{ transition: "color 0.2s ease, opacity 0.2s ease" }}
              />
            </Tooltip>
          ) : (
            <Tooltip title="Activate" placement="top" mouseEnterDelay={0.3}>
              <Button
                type="text"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => handleActivate(record)}
                style={{ transition: "color 0.2s ease, opacity 0.2s ease" }}
              />
            </Tooltip>
          )}
          <Tooltip title="Delete" placement="top" mouseEnterDelay={0.3}>
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record)}
              style={{ transition: "color 0.2s ease, opacity 0.2s ease" }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Users
            </Typography.Title>
            <Typography.Text type="secondary">
              Manage users in {profile?.organization_id ? "your organization" : "organization"}
            </Typography.Text>
          </div>
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            onClick={() => {
              setCreateSelectedRoleName("");
              createForm.resetFields();
              setCreateModalOpen(true);
            }}
          >
            Create User
          </Button>
        </div>
        <Input.Search
          allowClear
          placeholder="Search by name, email, role, department, or status"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setPagination((prev) => ({ ...prev, current: 1 }));
          }}
          style={{ marginTop: 16, maxWidth: 420 }}
        />
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
          {error}
        </div>
      )}

      {!loading && <AdminUserStats users={users} />}

      <AdminMfaRolloutCard />

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden" style={{ minHeight: 200 }}>
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <Spin size="large" tip="Loading users..." />
          </div>
        ) : (
          <Table
            className="table-single-line"
            columns={columns}
            dataSource={filteredUsers}
            rowKey="id"
            locale={{ emptyText: "No users found" }}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} users`,
              onChange: (page, pageSize) =>
                setPagination({ current: page, pageSize: pageSize || 10 }),
            }}
          />
        )}
      </div>

      <Modal
        title="Create User"
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          setCreateSelectedRoleName("");
          createForm.resetFields();
        }}
        onOk={handleCreateUser}
        confirmLoading={submitting}
        okText="Create User"
        destroyOnClose
        width={720}
      >
        <Form form={createForm} layout="vertical" className="mt-4">
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: "Email is required" },
                  { type: "email", message: "Invalid email" },
                ]}
              >
                <Input placeholder="user@company.com" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="password"
                label="Password"
                rules={[
                  { required: true, message: "Password is required" },
                  { min: 6, message: "Password must be at least 6 characters" },
                ]}
              >
                <Input.Password placeholder="••••••••" autoComplete="new-password" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="full_name" label="Full Name">
                <Input placeholder="John Doe" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="role_id" label="Role">
                <Select
                  placeholder="Select role"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  onChange={(roleId) => {
                    const role = roles.find((r) => r.id === roleId);
                    const normalized = (role?.name ?? "").toLowerCase().replace(/\s+/g, "_");
                    setCreateSelectedRoleName(normalized);
                    if (!roleRequiresClientBinding(normalized)) {
                      createForm.setFieldValue("client_id", undefined);
                    }
                    if (normalized === "client_viewer") {
                      createForm.setFieldsValue({ phone: undefined, employee_id: undefined });
                    }
                  }}
                  options={[...roles]
                    .sort((a, b) => {
                      const order = ["admin", "Agent", "Team Leader", "HR"];
                      return order.indexOf(a.name) - order.indexOf(b.name) || a.name.localeCompare(b.name);
                    })
                    .map((r) => ({ label: r.name, value: r.id }))}
                />
              </Form.Item>
            </Col>
            {createSelectedRoleName !== "client_viewer" && (
              <>
                <Col xs={24} sm={12}>
                  <Form.Item name="employee_id" label="Employee ID">
                    <Input placeholder="e.g. EMP001" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="phone" label="Mobile Number">
                    <Input placeholder="e.g. 9876543210" />
                  </Form.Item>
                </Col>
              </>
            )}
            {roleRequiresClientBinding(createSelectedRoleName) && (
              <Col span={24}>
                <Form.Item
                  name="client_id"
                  label="Select Client"
                  rules={[{ required: true, message: "Client selection is required for this role" }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Search and select client"
                    options={clients.map((c) => ({ label: c.name, value: c.id }))}
                  />
                </Form.Item>
                <ClientLogoUpload clientId={createClientId} />
              </Col>
            )}
            <Col xs={24} sm={12}>
              <Form.Item name="department" label="Department">
                <Input placeholder="Sales, Marketing, etc." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="designation" label="Designation">
                <Input placeholder="e.g. Sales Representative" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="Edit User"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditSelectedRoleName("");
          setSelectedUser(null);
          editForm.resetFields();
        }}
        onOk={handleSaveEdit}
        confirmLoading={submitting}
        okText="Save"
        destroyOnClose
        width={720}
      >
        {selectedUser && (
          <Form form={editForm} layout="vertical" className="mt-4">
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label="Email">
                  <Input value={selectedUser.email ?? ""} disabled />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="full_name" label="Full Name">
                  <Input placeholder="John Doe" />
                </Form.Item>
              </Col>
              {editSelectedRoleName !== "client_viewer" && (
                <>
                  <Col xs={24} sm={12}>
                    <Form.Item name="employee_id" label="Employee ID">
                      <Input placeholder="e.g. EMP001" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="phone" label="Mobile Number">
                      <Input placeholder="e.g. 9876543210" />
                    </Form.Item>
                  </Col>
                </>
              )}
              <Col xs={24} sm={12}>
                <Form.Item name="department" label="Department">
                  <Input placeholder="Sales, Marketing, etc." />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="designation" label="Designation">
                  <Input placeholder="e.g. Sales Representative" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="role_id" label="Role">
                  <Select
                    placeholder="Select role"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    onChange={(roleId) => {
                      const role = roles.find((r) => r.id === roleId);
                      const normalized = (role?.name ?? "").toLowerCase().replace(/\s+/g, "_");
                      setEditSelectedRoleName(normalized);
                      if (!roleRequiresClientBinding(normalized)) {
                        editForm.setFieldValue("client_id", undefined);
                      } else if (normalized === "dc" && !editForm.getFieldValue("client_id")) {
                        const dcClient = clients.find((c) => c.name.trim().toLowerCase() === "dc");
                        if (dcClient) editForm.setFieldValue("client_id", dcClient.id);
                      }
                      if (normalized === "client_viewer") {
                        editForm.setFieldsValue({ phone: undefined, employee_id: undefined });
                      }
                    }}
                    options={roles.map((r) => ({ label: r.name, value: r.id }))}
                  />
                </Form.Item>
              </Col>
              {roleRequiresClientBinding(editSelectedRoleName) && (
                <Col span={24}>
                  <Form.Item
                    name="client_id"
                    label="Select Client"
                    rules={[{ required: true, message: "Client selection is required for this role" }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Search and select client"
                      options={clients.map((c) => ({ label: c.name, value: c.id }))}
                    />
                  </Form.Item>
                  <ClientLogoUpload clientId={editClientId} />
                </Col>
              )}
            </Row>

            <Divider style={{ margin: "8px 0 16px" }}>Change password</Divider>
            <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12, fontSize: 13 }}>
              Leave blank to keep the current password.
            </Typography.Text>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="new_password"
                  label="New password"
                  rules={[
                    {
                      validator: async (_, value) => {
                        const pwd = typeof value === "string" ? value : "";
                        const confirm = editForm.getFieldValue("confirm_password") as string | undefined;
                        if (!pwd && !confirm) return;
                        if (pwd && pwd.length < 6) {
                          throw new Error("Password must be at least 6 characters");
                        }
                        if (confirm && !pwd) {
                          throw new Error("Enter a new password");
                        }
                      },
                    },
                  ]}
                >
                  <Input.Password placeholder="New password" autoComplete="new-password" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="confirm_password"
                  label="Confirm password"
                  dependencies={["new_password"]}
                  rules={[
                    {
                      validator: async (_, value) => {
                        const confirm = typeof value === "string" ? value : "";
                        const pwd = (editForm.getFieldValue("new_password") as string | undefined)?.trim() ?? "";
                        if (!pwd && !confirm) return;
                        if (pwd && !confirm) {
                          throw new Error("Please confirm the new password");
                        }
                        if (pwd && confirm !== pwd) {
                          throw new Error("Passwords do not match");
                        }
                      },
                    },
                  ]}
                >
                  <Input.Password placeholder="Confirm new password" autoComplete="new-password" />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        )}
      </Modal>
    </>
  );
}
