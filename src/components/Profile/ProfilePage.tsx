"use client";

import { useEffect, useState, useRef } from "react";
import {
  Card,
  Row,
  Col,
  Avatar,
  Typography,
  Form,
  Input,
  DatePicker,
  Button,
  Tag,
  Spin,
  message,
  Modal,
  Tooltip,
} from "antd";
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  IdcardOutlined,
  CalendarOutlined,
  TeamOutlined,
  FundProjectionScreenOutlined,
  EditOutlined,
  CameraOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { normalizeRoleName } from "@/lib/auth/config";
import dayjs from "dayjs";
import AvatarCropModal from "./AvatarCropModal";
import { ProfileDevicesCard } from "./ProfileDevicesCard";

type ProfileData = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  employee_id: string | null;
  agent_code: string | null;
  date_of_birth: string | null;
  avatar_url: string | null;
  joining_date: string | null;
  status: string;
  created_at: string;
  roles: string[];
  manager_name: string | null;
  assigned_campaigns: { id: string; name: string }[];
};

type ProfilePageProps = {
  profilePath: string;
  roleLabel: string;
};

const roleDisplayMap: Record<string, string> = {
  admin: "Admin",
  team_leader: "Team Leader",
  tl: "Team Leader",
  operations_manager: "Operations Manager",
  sales: "Sales",
  agent: "Agent",
  qa: "QA",
  mis: "MIS",
  mis_tl: "MIS TL",
  qa_tl: "QA TL",
  email_marketing_manager: "Email Marketing Manager",
};

const ASSIGNED_CAMPAIGNS_PAGE_SIZE = 8;

export default function ProfilePage({ profilePath, roleLabel }: ProfilePageProps) {
  const { profile: authProfile, roles, refreshProfile } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [editModal, setEditModal] = useState<"dob" | "phone" | "employee" | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string>("");
  const [avatarBust, setAvatarBust] = useState<string>("");
  const [campaignsVisible, setCampaignsVisible] = useState(ASSIGNED_CAMPAIGNS_PAGE_SIZE);
  const [form] = Form.useForm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setAvatarBust(sessionStorage.getItem("gandiv:avatar_updated") ?? "");
    } catch {
      /* ignore */
    }
  }, [data?.avatar_url]);

  useEffect(() => {
    setCampaignsVisible(ASSIGNED_CAMPAIGNS_PAGE_SIZE);
  }, [data?.assigned_campaigns]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profile", { credentials: "include" });
      const json = await res.json();
      if (res.ok && json.profile) {
        setData(json.profile);
      } else {
        message.error("Failed to load profile");
      }
    } catch {
      message.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      message.error("Please select a valid image (JPEG, PNG, WebP, GIF)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error("Image must be under 5MB");
      return;
    }
    const src = URL.createObjectURL(file);
    setCropImageSrc(src);
    setCropModalOpen(true);
    e.target.value = "";
  };

  const handleCropConfirm = async (croppedFile: File) => {
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", croppedFile);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await res.json();
      if (res.ok) {
        setData((d) =>
          d ? { ...d, avatar_url: json.avatar_url } : { id: authProfile?.id ?? "", full_name: authProfile?.full_name ?? null, email: authProfile?.email ?? null, phone: authProfile?.phone ?? null, employee_id: null, agent_code: null, date_of_birth: null, avatar_url: json.avatar_url, joining_date: null, status: "active", created_at: "", roles: [], manager_name: null, assigned_campaigns: [] }
        );
        await refreshProfile();
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem("gandiv:avatar_updated", String(Date.now()));
          } catch {
            /* ignore */
          }
        }
        message.success("Profile photo updated");
      } else {
        message.error(json.error || "Failed to upload photo");
      }
    } catch {
      message.error("Failed to upload photo");
    } finally {
      setAvatarUploading(false);
      if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc("");
    }
  };

  const handleCropCancel = () => {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc("");
    setCropModalOpen(false);
  };

  const handleUpdate = async (field: "dob" | "phone" | "employee") => {
    try {
      const values = await form.validateFields();
      setUpdating(true);
      const body: Record<string, unknown> = {};
      if (field === "dob") body.date_of_birth = values.date_of_birth?.format?.("YYYY-MM-DD") ?? null;
      if (field === "phone") body.phone = values.phone ?? null;
      if (field === "employee") body.employee_id = values.employee_id ?? null;

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok) {
        setData((d) => (d ? { ...d, ...json.profile } : null));
        setEditModal(null);
        refreshProfile();
        message.success("Profile updated");
      } else {
        message.error(json.error || "Failed to update");
      }
    } catch {
      // validation error
    } finally {
      setUpdating(false);
    }
  };

  const roleDisplay = roles.length
    ? roles
        .map((r) => roleDisplayMap[normalizeRoleName(r.role_name)] || r.role_name)
        .join(", ")
    : roleLabel;

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  const p: ProfileData = data ?? {
    id: authProfile?.id ?? "",
    full_name: authProfile?.full_name ?? null,
    email: authProfile?.email ?? null,
    phone: authProfile?.phone ?? null,
    employee_id: null,
    agent_code: null,
    date_of_birth: null,
    avatar_url: authProfile?.avatar_url ?? null,
    joining_date: null,
    status: "active",
    created_at: "",
    roles: [],
    manager_name: null,
    assigned_campaigns: [],
  };

  const joiningDate = p.joining_date || p.created_at;
  const assignedCampaigns = p.assigned_campaigns ?? [];
  const visibleCampaigns = assignedCampaigns.slice(0, campaignsVisible);
  const remainingCampaigns = assignedCampaigns.length - visibleCampaigns.length;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Typography.Title level={3} style={{ marginBottom: 24, fontWeight: 600 }}>
        Profile
      </Typography.Title>

      <Row gutter={[24, 24]} align="stretch">
        {/* Profile card */}
        <Col xs={24} md={10} style={{ display: "flex" }}>
          <Card
            style={{
              flex: 1,
              width: "100%",
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              border: "1px solid #f0f0f0",
            }}
          >
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                <Avatar
                  size={120}
                  src={
                    (p.avatar_url || authProfile?.avatar_url)
                      ? `${p.avatar_url || authProfile?.avatar_url}${avatarBust ? `?v=${avatarBust}` : ""}`
                      : undefined
                  }
                  icon={<UserOutlined />}
                  style={{
                    backgroundColor: (p.avatar_url || authProfile?.avatar_url) ? "transparent" : "#4f46e5",
                    border: "4px solid #f0f0f0",
                  }}
                />
                <label
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "#4f46e5",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: avatarUploading ? "wait" : "pointer",
                    opacity: avatarUploading ? 0.7 : 1,
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleAvatarFileSelect}
                    disabled={avatarUploading}
                  />
                  {avatarUploading ? <Spin size="small" /> : <CameraOutlined />}
                </label>
              </div>
              <Typography.Title level={4} style={{ marginTop: 16, marginBottom: 4 }}>
                {p.full_name || "—"}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {roleDisplay}
              </Typography.Text>
            </div>

            <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 20 }}>
              <ProfileRow icon={<MailOutlined />} label="Email" value={p.email || "—"} readOnly />
              <ProfileRow
                icon={<PhoneOutlined />}
                label="Mobile Number"
                value={p.phone || "—"}
                onEdit={() => {
                  form.setFieldsValue({ phone: p.phone });
                  setEditModal("phone");
                }}
              />
              <ProfileRow
                icon={<IdcardOutlined />}
                label="Employee ID"
                value={p.employee_id || p.agent_code || "—"}
                onEdit={() => {
                  form.setFieldsValue({ employee_id: p.employee_id || p.agent_code });
                  setEditModal("employee");
                }}
              />
              <ProfileRow
                icon={<CalendarOutlined />}
                label="Date of Birth"
                value={p.date_of_birth ? dayjs(p.date_of_birth).format("DD MMM YYYY") : "—"}
                onEdit={() => {
                  form.setFieldsValue({ date_of_birth: p.date_of_birth ? dayjs(p.date_of_birth) : null });
                  setEditModal("dob");
                }}
              />
              <ProfileRow icon={<UserOutlined />} label="Role" value={roleDisplay} readOnly />
              <ProfileRow
                icon={<TeamOutlined />}
                label="Team Leader / Manager"
                value={p.manager_name || "—"}
                readOnly
              />
            </div>
          </Card>
        </Col>

        {/* Work Information */}
        <Col xs={24} md={14} style={{ display: "flex" }}>
          <Card
            title={
              <span style={{ fontWeight: 600, fontSize: 16 }}>
                Work Information
              </span>
            }
            style={{
              flex: 1,
              width: "100%",
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              border: "1px solid #f0f0f0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Role
                </Typography.Text>
                <div style={{ marginTop: 4, fontWeight: 500 }}>
                  {roleDisplay}
                </div>
              </Col>
              <Col span={12}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Joining Date
                </Typography.Text>
                <div style={{ marginTop: 4, fontWeight: 500 }}>
                  {joiningDate ? dayjs(joiningDate).format("DD MMM YYYY") : "—"}
                </div>
              </Col>
              <Col span={12}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Status
                </Typography.Text>
                <div style={{ marginTop: 4 }}>
                  <Tag color={p.status === "active" ? "green" : "default"}>
                    {p.status === "active" ? "Active" : "Inactive"}
                  </Tag>
                </div>
              </Col>
              <Col span={24}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Assigned Campaigns
                  {assignedCampaigns.length > 0 ? ` (${assignedCampaigns.length})` : ""}
                </Typography.Text>
                {assignedCampaigns.length > 0 ? (
                  <>
                    <div
                      className="profile-assigned-campaigns-list"
                      style={{
                        marginTop: 8,
                        maxHeight: 280,
                        overflowY: "auto",
                        overflowX: "hidden",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        alignContent: "flex-start",
                        paddingRight: 4,
                      }}
                    >
                      {visibleCampaigns.map((c) => (
                        <div
                          key={c.id}
                          style={{ flexShrink: 0, maxWidth: "100%", lineHeight: 1 }}
                        >
                          <Tooltip title={c.name} placement="topLeft">
                            <Tag
                            icon={<FundProjectionScreenOutlined />}
                            style={{
                              margin: 0,
                              maxWidth: "100%",
                              flexShrink: 0,
                              display: "inline-flex",
                              alignItems: "center",
                              overflow: "hidden",
                              lineHeight: "22px",
                            }}
                          >
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: 420,
                              }}
                            >
                              {c.name}
                            </span>
                            </Tag>
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {remainingCampaigns > 0 && (
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: 0, height: "auto" }}
                          onClick={() =>
                            setCampaignsVisible((n) => n + ASSIGNED_CAMPAIGNS_PAGE_SIZE)
                          }
                        >
                          Load more ({remainingCampaigns} remaining)
                        </Button>
                      )}
                      {campaignsVisible > ASSIGNED_CAMPAIGNS_PAGE_SIZE && (
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: 0, height: "auto" }}
                          onClick={() => setCampaignsVisible(ASSIGNED_CAMPAIGNS_PAGE_SIZE)}
                        >
                          Show less
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <Typography.Text type="secondary" style={{ marginTop: 8, display: "block" }}>
                    No campaigns assigned
                  </Typography.Text>
                )}
              </Col>
              <Col span={24}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Assigned Team
                </Typography.Text>
                <div style={{ marginTop: 4, fontWeight: 500 }}>
                  {p.manager_name ? `${p.manager_name} (Manager)` : "—"}
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <ProfileDevicesCard />

      {/* Edit modals */}
      <Modal
        title="Update Date of Birth"
        open={editModal === "dob"}
        onCancel={() => setEditModal(null)}
        onOk={() => handleUpdate("dob")}
        confirmLoading={updating}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="date_of_birth" label="Date of Birth">
            <DatePicker style={{ width: "100%" }} format="DD MMM YYYY" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Update Phone Number"
        open={editModal === "phone"}
        onCancel={() => setEditModal(null)}
        onOk={() => handleUpdate("phone")}
        confirmLoading={updating}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="phone" label="Mobile Number" rules={[{ required: false }]}>
            <Input placeholder="+91 9876543210" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Add/Update Employee ID"
        open={editModal === "employee"}
        onCancel={() => setEditModal(null)}
        onOk={() => handleUpdate("employee")}
        confirmLoading={updating}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="employee_id" label="Employee ID" rules={[{ required: false }]}>
            <Input placeholder="EMP001" />
          </Form.Item>
        </Form>
      </Modal>

      <AvatarCropModal
        open={cropModalOpen}
        imageSrc={cropImageSrc}
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />
    </div>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  readOnly,
  onEdit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  readOnly?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: "1px solid #fafafa",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <span style={{ color: "#6b7280", fontSize: 16 }}>{icon}</span>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
            {label}
          </Typography.Text>
          <Typography.Text style={{ fontSize: 14, fontWeight: 500 }} ellipsis>
            {value}
          </Typography.Text>
        </div>
      </div>
      {!readOnly && onEdit && (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={onEdit}
          style={{ flexShrink: 0 }}
        />
      )}
    </div>
  );
}
