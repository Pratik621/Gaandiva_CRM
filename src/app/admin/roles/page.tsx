"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Tag,
  Tooltip,
  message,
  Spin,
  Typography,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import type { Tables } from "@/types/database.types";

type RoleRow = Tables<"roles">;

export default function AdminRolesPage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roles", { credentials: "include" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load roles");
      }

      setRoles(data.roles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roles");
      message.error("Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    if (!hasRole("admin")) {
      router.replace("/login");
      return;
    }
    fetchRoles();
  }, [isInitialized, hasRole, router, fetchRoles]);

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/admin/roles/seed", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to seed roles");
      }

      message.success(data.message || "Default roles created");
      fetchRoles();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to seed roles");
    } finally {
      setSeeding(false);
    }
  };

  const handleCreateRole = async () => {
    try {
      const values = await createForm.validateFields();
      setSubmitting(true);

      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: values.name?.trim(),
          description: values.description?.trim() || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to create role");
      }

      message.success("Role created successfully");
      setCreateModalOpen(false);
      createForm.resetFields();
      fetchRoles();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to create role");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditRole = (record: RoleRow) => {
    setSelectedRole(record);
    editForm.setFieldsValue({
      name: record.name,
      description: record.description || "",
    });
    setEditModalOpen(true);
  };

  const handleUpdateRole = async () => {
    if (!selectedRole) return;
    try {
      const values = await editForm.validateFields();
      setSubmitting(true);

      const res = await fetch(`/api/admin/roles/${selectedRole.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: values.name?.trim(),
          description: values.description?.trim() || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to update role");
      }

      message.success("Role updated successfully");
      setEditModalOpen(false);
      setSelectedRole(null);
      editForm.resetFields();
      fetchRoles();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (record: RoleRow) => {
    Modal.confirm({
      title: "Delete role?",
      content: `Are you sure you want to delete "${record.name}"? Users with this role will lose it.`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const res = await fetch(`/api/admin/roles/${record.id}`, {
            method: "DELETE",
            credentials: "include",
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Failed to delete role");
          message.success("Role deleted");
          fetchRoles();
        } catch (err) {
          message.error(err instanceof Error ? err.message : "Failed to delete role");
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

  if (!hasRole("admin")) {
    return null;
  }

  const columns = [
    {
      title: "Sr. No",
      key: "sr",
      width: 80,
      render: (_: unknown, __: RoleRow, index: number) => index + 1,
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (val: string) => <Tag color="blue">{val}</Tag>,
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      render: (val: string | null) => val || "—",
    },
    {
      title: "Actions",
      key: "actions",
      width: 120,
      render: (_: unknown, record: RoleRow) => (
        <Space size="middle" style={{ transition: "opacity 0.2s ease" }}>
          <Tooltip title="Edit" placement="top" mouseEnterDelay={0.3}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditRole(record)}
              style={{ transition: "color 0.2s ease, opacity 0.2s ease" }}
            />
          </Tooltip>
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Roles
            </Typography.Title>
            <Typography.Text type="secondary">
              Manage organization roles. Default set includes Admin, Team Leader, Agent, Sales, QA, and Campaign Command Center roles (client_viewer, internal_operator, internal_admin).
            </Typography.Text>
          </div>
          <Space>
            <Button
              icon={<SafetyCertificateOutlined />}
              onClick={handleSeedDefaults}
              loading={seeding}
            >
              Create Default Roles
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                createForm.resetFields();
                setCreateModalOpen(true);
              }}
            >
              Add Role
            </Button>
          </Space>
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <Table
          className="table-single-line"
          dataSource={roles}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ defaultPageSize: 10, showSizeChanger: true, showTotal: (t) => `Total ${t} roles` }}
          locale={{ emptyText: error || "No roles yet. Create default roles or add one manually." }}
        />
      </div>

      <Modal
        title="Add Role"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleCreateRole}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Role Name"
            rules={[{ required: true, message: "Role name is required" }]}
          >
            <Input placeholder="e.g. Sales, QA" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit Role"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setSelectedRole(null);
          editForm.resetFields();
        }}
        onOk={handleUpdateRole}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Role Name"
            rules={[{ required: true, message: "Role name is required" }]}
          >
            <Input placeholder="e.g. Sales, QA" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
