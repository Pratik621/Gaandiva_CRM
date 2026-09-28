"use client";

import { useState } from "react";
import {
  Form,
  Input,
  Button,
  message,
  Row,
  Col,
  Select,
  DatePicker,
  InputNumber,
  Divider,
  Card,
} from "antd";
import type { FormInstance } from "antd";
import { BankOutlined, UserOutlined, RiseOutlined, AimOutlined } from "@ant-design/icons";

const { TextArea } = Input;

const COMPANY_SIZES = [
  { value: "1-10", label: "1–10" },
  { value: "11-50", label: "11–50" },
  { value: "50-200", label: "50–200" },
  { value: "200-500", label: "200–500" },
  { value: "500+", label: "500+" },
];

const TARGET_MARKETS = [
  { value: "B2B", label: "B2B" },
  { value: "B2C", label: "B2C" },
  { value: "Both", label: "Both" },
];

export type AddClientFormSuccess = { id: string; company_name: string; created_at: string };

type AddClientFormValues = Record<string, unknown>;

type AddClientFormProps = {
  form: FormInstance<AddClientFormValues>;
  /** When `edit`, submits PATCH to `/api/sales/clients/[clientId]`. */
  mode?: "create" | "edit";
  clientId?: string;
  onSuccess?: (client: AddClientFormSuccess) => void;
  /** Called after a successful update when `mode` is `edit`. */
  onUpdateSuccess?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
};

export function AddClientForm({
  form,
  mode = "create",
  clientId,
  onSuccess,
  onUpdateSuccess,
  onCancel,
  showCancel = true,
}: AddClientFormProps) {
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: AddClientFormValues) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        expected_start_date: values.expected_start_date
          ? (values.expected_start_date as { format: (f: string) => string }).format("YYYY-MM-DD")
          : null,
      };

      if (mode === "edit" && clientId) {
        const res = await fetch(`/api/sales/clients/${clientId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          message.error(data.error || "Failed to update client");
          return;
        }
        message.success("Client updated successfully.");
        form.resetFields();
        onUpdateSuccess?.();
        return;
      }

      const res = await fetch("/api/sales/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        message.error(data.error || "Failed to add client");
        return;
      }
      message.success("Client added successfully.");
      form.resetFields();
      onSuccess?.({ id: data.id, company_name: data.company_name, created_at: data.created_at });
    } catch {
      message.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form<AddClientFormValues> form={form} layout="vertical" onFinish={onFinish}>
      <Row gutter={20} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card size="small" title={<span><BankOutlined style={{ marginRight: 8 }} />Company Information</span>} styles={{ body: { paddingTop: 8 } }}>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="company_name" label="Client name" rules={[{ required: true, message: "Required" }]}>
                  <Input placeholder="e.g. Acme Inc." />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="client_code"
                  label="Client Code"
                  rules={[{ required: true, message: "Required" }, { max: 20, message: "Max 20 chars" }]}
                  tooltip="Short unique code for this client (e.g. CYB, 7KD)."
                >
                  <Input placeholder="e.g. CYB" style={{ fontFamily: "monospace" }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="company_website" label="Company Website">
                  <Input placeholder="https://..." />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="industry_type" label="Industry Type">
                  <Input placeholder="e.g. Technology, Healthcare" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="company_size" label="Company Size">
                  <Select placeholder="Select size" allowClear options={COMPANY_SIZES} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="year_established" label="Year Established">
                  <InputNumber style={{ width: "100%" }} placeholder="e.g. 2015" min={1900} max={new Date().getFullYear()} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="company_address" label="Company Address">
                  <Input placeholder="Street, building, etc." />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="city" label="City">
                  <Input placeholder="City" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="state" label="State">
                  <Input placeholder="State / Province" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="country" label="Country" rules={[{ required: true, message: "Required" }]}>
                  <Input placeholder="Country" />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title={<span><UserOutlined style={{ marginRight: 8 }} />Primary Contact Person</span>} styles={{ body: { paddingTop: 8 } }}>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="contact_person" label="Contact Person" rules={[{ required: true, message: "Required" }]}>
                  <Input placeholder="e.g. Primary contact" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="contact_full_name" label="Client Name" rules={[{ required: true, message: "Required" }]}>
                  <Input placeholder="Contact full name" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="contact_designation" label="Designation">
                  <Input placeholder="e.g. CEO, Sales Director" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="contact_work_email" label="Work Email">
                  <Input type="email" placeholder="email@company.com" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="contact_mobile" label="Mobile Number">
                  <Input placeholder="+1 234 567 8900" />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="contact_linkedin" label="LinkedIn Profile (optional)">
                  <Input placeholder="https://linkedin.com/in/..." />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
      <Row gutter={20} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card size="small" title={<span><RiseOutlined style={{ marginRight: 8 }} />Business Details</span>} styles={{ body: { paddingTop: 8 } }}>
            <Row gutter={12}>
              <Col span={24}>
                <Form.Item name="services_products_offered" label="Services / Products Offered">
                  <TextArea rows={2} placeholder="Brief description" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="target_market" label="Target Market">
                  <Select placeholder="B2B / B2C / Both" allowClear options={TARGET_MARKETS} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="target_geography" label="Target Geography">
                  <Input placeholder="e.g. North America, APAC" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="current_revenue_range" label="Current Revenue Range">
                  <Input placeholder="e.g. $1M–$5M" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="existing_crm" label="Existing CRM">
                  <Select placeholder="Yes / No" allowClear options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="existing_crm_which" label="If yes, which CRM?">
                  <Input placeholder="e.g. Salesforce, HubSpot" />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title={<span><AimOutlined style={{ marginRight: 8 }} />Requirements</span>} styles={{ body: { paddingTop: 8 } }}>
            <Row gutter={12}>
              <Col span={24}>
                <Form.Item name="problem_solving" label="What problem are you solving?">
                  <TextArea rows={2} placeholder="Describe the problem or goal" />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="services_looking_for" label="What services are you looking for?">
                  <TextArea rows={2} placeholder="Lead gen, outbound, etc." />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="budget_range" label="Budget Range">
                  <Input placeholder="e.g. $10k–$50k" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="expected_start_date" label="Expected Start Date">
                  <DatePicker style={{ width: "100%" }} placeholder="Select date" />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
      <Divider style={{ margin: "8px 0 16px" }} />
      <Form.Item style={{ marginBottom: 0 }}>
        <Button type="primary" htmlType="submit" size="large" loading={loading}>
          {mode === "edit" ? "Save changes" : "Save Client"}
        </Button>
        {showCancel && (
          <Button type="default" size="large" style={{ marginLeft: 12 }} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </Form.Item>
    </Form>
  );
}
