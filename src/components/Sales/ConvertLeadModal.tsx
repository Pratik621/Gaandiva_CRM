"use client";

import { useEffect, useState } from "react";
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Checkbox,
  Alert,
  Descriptions,
  Tag,
  Divider,
  Space,
  Typography,
} from "antd";
import {
  BankOutlined,
  UserOutlined,
  RiseOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

const DEAL_STAGE_OPTIONS = [
  { value: "qualification", label: "Qualification" },
  { value: "proposal", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "closed_won", label: "Closed Won" },
  { value: "closed_lost", label: "Closed Lost" },
];

export type LeadForConversion = {
  id: string;
  lead_name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};

type Props = {
  lead: LeadForConversion | null;
  open: boolean;
  onClose: () => void;
  onConverted: () => void;
};

export function ConvertLeadModal({ lead, open, onClose, onConverted }: Props) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [createDeal, setCreateDeal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    account_created: boolean;
    account_id: string;
    contact_id: string;
    deal_id: string | null;
  } | null>(null);

  useEffect(() => {
    if (open && lead) {
      form.setFieldsValue({
        company_name: lead.company ?? "",
        contact_name: lead.lead_name ?? "",
        deal_stage: "qualification",
        deal_value: null,
      });
      setCreateDeal(false);
      setErrorMsg(null);
      setSuccessInfo(null);
    }
  }, [open, lead, form]);

  const handleConvert = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      setErrorMsg(null);

      const res = await fetch(`/api/sales/leads/${lead!.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          company_name: values.company_name,
          contact_name: values.contact_name,
          create_deal: createDeal,
          deal_value: createDeal ? values.deal_value ?? null : null,
          deal_stage: createDeal ? values.deal_stage ?? "qualification" : null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorMsg(json.error ?? "Conversion failed");
        return;
      }

      setSuccessInfo({
        account_created: json.account_created,
        account_id: json.account_id,
        contact_id: json.contact_id,
        deal_id: json.deal_id ?? null,
      });
      onConverted();
    } catch {
      // validation errors are shown inline
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSuccessInfo(null);
    setErrorMsg(null);
    setCreateDeal(false);
    form.resetFields();
    onClose();
  };

  if (!lead) return null;

  return (
    <Modal
      title={
        <Space>
          <CheckCircleOutlined style={{ color: "#52c41a" }} />
          <span>Convert Lead</span>
        </Space>
      }
      open={open}
      onCancel={handleClose}
      onOk={successInfo ? handleClose : handleConvert}
      okText={successInfo ? "Done" : "Convert"}
      cancelText={successInfo ? null : "Cancel"}
      cancelButtonProps={successInfo ? { style: { display: "none" } } : undefined}
      confirmLoading={loading}
      width={560}
      destroyOnClose
    >
      {/* Lead summary */}
      <Descriptions
        size="small"
        bordered
        column={2}
        style={{ marginBottom: 16 }}
      >
        <Descriptions.Item label="Lead Name" span={2}>
          <Text strong>{lead.lead_name ?? "—"}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Email">{lead.email ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Phone">{lead.phone ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Status" span={2}>
          <Tag color="blue">{lead.status}</Tag>
        </Descriptions.Item>
      </Descriptions>

      {errorMsg && (
        <Alert
          type="error"
          message={errorMsg}
          showIcon
          closable
          onClose={() => setErrorMsg(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {successInfo ? (
        <Alert
          type="success"
          showIcon
          message="Lead successfully converted!"
          description={
            <ul style={{ margin: "8px 0 0 0", paddingLeft: 20 }}>
              <li>
                <BankOutlined style={{ marginRight: 6 }} />
                Account: {successInfo.account_created ? "Created" : "Linked (existing)"}
              </li>
              <li>
                <UserOutlined style={{ marginRight: 6 }} />
                Contact: Created
              </li>
              {successInfo.deal_id && (
                <li>
                  <RiseOutlined style={{ marginRight: 6 }} />
                  Deal: Created
                </li>
              )}
            </ul>
          }
        />
      ) : (
        <Form form={form} layout="vertical">
          <Divider orientation="left" orientationMargin={0}>
            <BankOutlined style={{ marginRight: 6 }} />
            Account
          </Divider>
          <Form.Item
            name="company_name"
            label="Company Name"
            rules={[{ required: true, message: "Company name is required" }]}
          >
            <Input placeholder="Company name" />
          </Form.Item>

          <Divider orientation="left" orientationMargin={0}>
            <UserOutlined style={{ marginRight: 6 }} />
            Contact
          </Divider>
          <Form.Item
            name="contact_name"
            label="Contact Name"
            rules={[{ required: true, message: "Contact name is required" }]}
          >
            <Input placeholder="Contact full name" />
          </Form.Item>

          <Divider orientation="left" orientationMargin={0}>
            <RiseOutlined style={{ marginRight: 6 }} />
            Deal (optional)
          </Divider>
          <Form.Item style={{ marginBottom: createDeal ? 16 : 0 }}>
            <Checkbox
              checked={createDeal}
              onChange={(e) => setCreateDeal(e.target.checked)}
            >
              Create a Deal from this lead
            </Checkbox>
          </Form.Item>

          {createDeal && (
            <>
              <Form.Item name="deal_value" label="Deal Value ($)">
                <InputNumber
                  min={0}
                  style={{ width: "100%" }}
                  placeholder="e.g. 50000"
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                />
              </Form.Item>
              <Form.Item name="deal_stage" label="Deal Stage">
                <Select options={DEAL_STAGE_OPTIONS} />
              </Form.Item>
            </>
          )}
        </Form>
      )}
    </Modal>
  );
}
