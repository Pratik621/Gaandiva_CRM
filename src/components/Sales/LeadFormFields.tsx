"use client";

import { Col, DatePicker, Form, Input, InputNumber, Row, Select, Typography } from "antd";
import { LEAD_STATUS_OPTIONS, LIFECYCLE_STAGE_OPTIONS } from "@/constants/salesLeadForm";

const { Title } = Typography;

export type LeadFormAgent = { id: string; name: string };

type Props = {
  mode: "create" | "edit";
  /** Short id preview when editing */
  leadId?: string;
  agents: LeadFormAgent[];
  /** When true (detail page), owner can be reassigned */
  ownerEditable?: boolean;
};

export function LeadFormFields({ mode, leadId, agents, ownerEditable }: Props) {
  const isEdit = mode === "edit";

  return (
    <>
      <Row gutter={20} style={{ marginBottom: 8 }}>
        <Col xs={24} lg={12}>
          <Title level={5} style={{ marginTop: 0 }}>
            Basic Lead Information
          </Title>
          <Row gutter={12}>
            {isEdit && leadId && (
              <Col span={12}>
                <Form.Item label="Lead ID">
                  <Input value={leadId.slice(0, 8)} disabled />
                </Form.Item>
              </Col>

            )}
            <Col span={12}>
              <Form.Item name="status" label="Lead Status">
                <Select options={[...LEAD_STATUS_OPTIONS]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>

            <Col span={12}>
              <Form.Item name="lead_source" label="Lead Source">
                <Input placeholder="Website, Campaign, Referral, etc." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="assigned_to_id" label="Lead owner / Sales agent">
                <Select
                  allowClear
                  placeholder="Select owner"
                  disabled={isEdit && !ownerEditable}
                  options={agents.map((a) => ({
                    value: a.id,
                    label: a.name,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>


          <Row gutter={12}>
            {isEdit && (
              <Col span={12}>
                <Form.Item name="created_at" label="Lead created date">
                  <DatePicker style={{ width: "100%" }} disabled />
                </Form.Item>
              </Col>
            )}
            <Col span={12}>
              <Form.Item
                name="lead_score"
                label="Lifecycle stage"
                rules={isEdit ? [{ required: true, message: "Lifecycle stage is required" }] : []}
              >
                <Select allowClear placeholder="Select lifecycle stage" options={[...LIFECYCLE_STAGE_OPTIONS]} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="first_name" label="First name" rules={[{ required: true, message: "First name is required" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="last_name" label="Last name" rules={[{ required: true, message: "Last name is required" }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="job_title" label="Job title / designation">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email address" rules={[{ required: true, message: "Email address is required" }, { type: "email", message: "Please enter a valid email" }]}>
                <Input type="email" placeholder="name@company.com" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="phone" label="Phone number">
                <Input type="tel" placeholder="+1 555 123 4567" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="linkedin" label="LinkedIn profile">
                <Input placeholder="https://linkedin.com/in/..." />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="alt_phone" label="Alternate phone">
                <Input type="tel" placeholder="Optional second number" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="department" label="Department">
                <Input />
              </Form.Item>
            </Col>
          </Row>


        </Col>

        <Col xs={24} lg={12}>
          <Title level={5} style={{ marginTop: 0 }}>
            Company information
          </Title>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="company" label="Company name" rules={[{ required: true, message: "Company name is required" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="website" label="Company website" rules={[{ required: true, message: "Company website is required" }]}>
                <Input placeholder="https://company.com" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="industry" label="Industry">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="company_size" label="Company size (employees)">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="annual_revenue" label="Annual revenue">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="business_type" label="Business type">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="gst_number" label="GST number">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pan_number" label="PAN number">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="budget" label="Budget">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="decision_maker" label="Decision maker (yes/no)">
                <Select
                  allowClear
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="purchase_timeline" label="Purchase timeline">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="current_solution" label="Current solution / vendor">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pain_points" label="Pain points">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="requirements" label="Requirements / notes">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>
        </Col>
      </Row>

      <Row gutter={20} style={{ marginBottom: 8 }}>
        <Col xs={24} lg={12}>
          <Title level={5} style={{ marginTop: 24 }}>
            Activity & tracking
          </Title>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="last_contacted" label="Last contacted date">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="next_followup" label="Next follow-up date">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="followup_type" label="Follow-up type">
            <Select
              allowClear
              options={[
                { value: "call", label: "Call" },
                { value: "email", label: "Email" },
                { value: "meeting", label: "Meeting" },
              ]}
            />
          </Form.Item>
          <Form.Item name="interaction_notes" label="Interaction notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Col>

        <Col xs={24} lg={12}>
          <Title level={5} style={{ marginTop: 24 }}>
            Address details
          </Title>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="country" label="Country" rules={[{ required: true, message: "Country is required" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="state" label="State">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="city" label="City">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="zip" label="Zip / postal code">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="Full address">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Col>
      </Row>



      <Row gutter={20} style={{ marginBottom: 8 }}>
        <Col xs={24} lg={12}>
          <Title level={5} style={{ marginTop: 24 }}>
            Sales pipeline
          </Title>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="deal_stage" label="Deal stage">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="deal_value" label="Deal value">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Col>

        <Col xs={24} lg={12}>
          <Title level={5} style={{ marginTop: 24 }}>
            Qualification & disqualification
          </Title>
          <Form.Item name="disqualification_reason" label="Disqualification reason">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={20} style={{ marginBottom: 8 }}>
        <Col xs={24} lg={12}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="probability" label="Probability (%)">
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="expected_close_date" label="Expected close date">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
        </Col>
      </Row>
      <Row gutter={20} style={{ marginBottom: 8 }}>
        <Col xs={24} lg={12}>
          <Form.Item name="product_interest" label="Product interest">
            <Input />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={20} style={{ marginBottom: 8 }}><Col xs={24} lg={12}>
        <Form.Item name="tags" label="Tags / labels">
          <Select mode="tags" tokenSeparators={[","]} placeholder="Add tags like: high-priority, partner, etc." />
        </Form.Item>
      </Col>
      </Row>

      {isEdit && (
        <>
          <Title level={5} style={{ marginTop: 24 }}>
            Internal CRM fields
          </Title>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="created_by" label="Created by">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="updated_by" label="Updated by">
                <Input disabled />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="updated_at" label="Updated at">
                <DatePicker style={{ width: "100%" }} disabled />
              </Form.Item>
            </Col>
          </Row>
        </>
      )}


    </>
  );
}
