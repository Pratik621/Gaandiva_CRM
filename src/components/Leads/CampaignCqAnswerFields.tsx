"use client";

import { Form, Input, Row, Col, Select } from "antd";
import {
  isDropdownCampaignQuestion,
  leadAnswerFieldName,
  normalizeCqAnswerValue,
  type CampaignQuestion,
} from "@/lib/campaign-questions";

type CampaignCqDropdownAnswerProps = {
  value?: string;
  onChange?: (value: string) => void;
  options: string[];
};

/** Single-value select that also accepts a newly typed option on Enter. */
function CampaignCqDropdownAnswer({
  value,
  onChange,
  options,
}: CampaignCqDropdownAnswerProps) {
  const tagValue =
    value != null && String(value).trim() !== "" ? [String(value).trim()] : [];

  return (
    <Select
      mode="tags"
      maxCount={1}
      value={tagValue}
      onChange={(vals) => {
        const next = Array.isArray(vals) ? (vals[vals.length - 1] ?? "") : "";
        onChange?.(normalizeCqAnswerValue(next));
      }}
      placeholder="Select or type new answer and press Enter"
      tokenSeparators={[","]}
      allowClear
      showSearch
      optionFilterProp="label"
      options={options.map((option) => ({
        value: option,
        label: option,
      }))}
    />
  );
}

type CampaignCqAnswerFieldsProps = {
  questions: CampaignQuestion[];
};

/** Agent (and other roles) answer inputs — labels come from the campaign definition. */
export function CampaignCqAnswerFields({ questions }: CampaignCqAnswerFieldsProps) {
  if (questions.length === 0) return null;

  return (
    <Row gutter={[0, 4]}>
      {questions.map((q) => (
        <Col xs={24} key={q.key}>
          <Form.Item
            className="lead-campaign-cq-item"
            label={q.label}
            name={leadAnswerFieldName(q.key)}
            normalize={normalizeCqAnswerValue}
            style={{ marginBottom: 16 }}
          >
            {isDropdownCampaignQuestion(q) ? (
              <CampaignCqDropdownAnswer options={q.options ?? []} />
            ) : (
              <Input placeholder="Your answer" allowClear />
            )}
          </Form.Item>
        </Col>
      ))}
    </Row>
  );
}
