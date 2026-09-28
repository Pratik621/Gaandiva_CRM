"use client";

import { Button, Col, Form, Input, Row, Select, Typography } from "antd";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import {
  DEMAND_QUALIFICATION_INSIGHTS_LABEL,
  type CampaignQuestionFormRow,
} from "@/lib/campaign-questions";

const { Text } = Typography;

type CampaignQuestionsEditorProps = {
  /** Form.List name — defaults to campaign_question_rows */
  listName?: string;
};

export function CampaignQuestionsEditor({
  listName = "campaign_question_rows",
}: CampaignQuestionsEditorProps) {
  return (
    <div style={{ marginTop: 8, marginBottom: 8 }}>
      <Text strong style={{ display: "block", marginBottom: 4, fontSize: 14 }}>
        {DEMAND_QUALIFICATION_INSIGHTS_LABEL}
      </Text>
      <Text type="secondary" style={{ display: "block", marginBottom: 12, fontSize: 12 }}>
        Define demand & qualification questions agents answer when adding or editing leads.
        Add dropdown options on any question (e.g. CQ1) to show agents a select list instead of
        free text.
      </Text>
      <Form.List
        name={listName}
        initialValue={Array.from({ length: 5 }, () => ({ label: "", options: [] }))}
      >
        {(fields, { add, remove }) => (
          <>
            {fields.map((field, index) => (
              <div
                key={field.key}
                style={{
                  marginBottom: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #f0f0f0",
                  background: "#fafafa",
                }}
              >
                <Row gutter={12} align="middle">
                  <Col flex="72px">
                    <Text type="secondary" style={{ fontSize: 13, fontWeight: 600 }}>
                      CQ{index + 1}
                    </Text>
                  </Col>
                  <Col flex="auto">
                    <Form.Item
                      name={[field.name, "label"]}
                      style={{ marginBottom: 0 }}
                      rules={[
                        {
                          max: 500,
                          message: "Question is too long",
                        },
                      ]}
                    >
                      <Input placeholder="e.g. Age?, City?, Interested product?" allowClear />
                    </Form.Item>
                  </Col>
                  <Col flex="40px">
                    {fields.length > 1 && (
                      <Button
                        type="text"
                        danger
                        icon={<MinusCircleOutlined />}
                        aria-label={`Remove question ${index + 1}`}
                        onClick={() => remove(field.name)}
                      />
                    )}
                  </Col>
                </Row>
                <Row gutter={12} style={{ marginTop: 8 }}>
                  <Col flex="72px" />
                  <Col flex="auto">
                    <Form.Item
                      name={[field.name, "options"]}
                      label={
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Dropdown options (optional)
                        </Text>
                      }
                      style={{ marginBottom: 0 }}
                      tooltip="When options are added, agents see a dropdown for this question."
                    >
                      <Select
                        mode="tags"
                        placeholder="Type option and press Enter (e.g. Yes, No, Maybe)"
                        tokenSeparators={[","]}
                        allowClear
                        maxTagCount="responsive"
                        options={[]}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            ))}
            <Button
              type="dashed"
              onClick={() => add({ label: "", options: [] } as CampaignQuestionFormRow)}
              icon={<PlusOutlined />}
              style={{ width: "100%", marginTop: 4 }}
            >
              Add question
            </Button>
          </>
        )}
      </Form.List>
    </div>
  );
}
