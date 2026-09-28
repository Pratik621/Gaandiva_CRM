"use client";

import { Button, Col, Row, Select, Tooltip, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  B2B_SPEC_CATALOG,
  createB2BSpecEntry,
  getAvailableB2BFieldKeys,
  getB2BSpecDefinition,
  type B2BSpecEntry,
  type B2BSpecFieldKey,
} from "@/lib/command/check-data-b2b-specs";

const { Text } = Typography;

interface B2BSpecsBuilderProps {
  entries: B2BSpecEntry[];
  onChange: (entries: B2BSpecEntry[]) => void;
}

export default function B2BSpecsBuilder({ entries, onChange }: B2BSpecsBuilderProps) {
  const usedKeys = new Set(entries.map((e) => e.fieldKey));
  const canAddMore = entries.length < B2B_SPEC_CATALOG.length;

  const addEntry = () => {
    const available = getAvailableB2BFieldKeys(usedKeys);
    if (!available.length) return;
    onChange([...entries, createB2BSpecEntry(available[0])]);
  };

  const updateEntry = (id: string, patch: Partial<B2BSpecEntry>) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <Tooltip title={canAddMore ? "Add a new spec field" : "All available spec fields are already added"}>
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={addEntry}
            disabled={!canAddMore}
            style={{ flexShrink: 0 }}
          >
            Add Spec Field
          </Button>
        </Tooltip>
      </div>

      {entries.length === 0 ? (
        <div
          style={{
            padding: "20px 16px",
            borderRadius: 10,
            border: "1px dashed #d1d5db",
            background: "#fafafa",
            textAlign: "center",
          }}
        >
            <Text type="secondary" style={{ fontSize: 13 }}>
              No advanced specs added yet. Click <strong>Add Spec Field</strong> for buying intent, EHR stack,
              therapeutic area, payer mix, ABM tiers, and more — unique to healthcare & life sciences.
            </Text>
        </div>
      ) : (
        <Row gutter={[12, 12]}>
          {entries.map((entry) => {
            const def = getB2BSpecDefinition(entry.fieldKey);
            const fieldOptions = getAvailableB2BFieldKeys(usedKeys, entry.fieldKey);

            return (
              <Col xs={24} lg={12} key={entry.id}>
                <div
                  style={{
                    position: "relative",
                    padding: "14px 16px",
                    borderRadius: 10,
                    border: "1px solid #eef2f6",
                    background: "#fff",
                    height: "100%",
                  }}
                >
                  <Tooltip title="Remove spec field">
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => removeEntry(entry.id)}
                      style={{ position: "absolute", top: 8, right: 8 }}
                    />
                  </Tooltip>

                  <Row gutter={[12, 0]}>
                    <Col span={12}>
                      <Text strong style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>
                        Spec Field
                      </Text>
                      <Select
                        style={{ width: "100%" }}
                        value={entry.fieldKey}
                        onChange={(key: B2BSpecFieldKey) => updateEntry(entry.id, { fieldKey: key, values: [] })}
                        options={fieldOptions.map((key) => {
                          const item = getB2BSpecDefinition(key);
                          return { value: key, label: item.label };
                        })}
                      />
                      <Text
                        type="secondary"
                        style={{ fontSize: 11, marginTop: 6, display: "block", lineHeight: 1.4, paddingRight: 8 }}
                      >
                        {def.description}
                      </Text>
                    </Col>

                    <Col span={12}>
                      <Text strong style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>
                        Values
                      </Text>
                      <Select
                        mode="multiple"
                        showSearch
                        allowClear
                        style={{ width: "100%" }}
                        placeholder={def.placeholder}
                        value={entry.values}
                        onChange={(values) => updateEntry(entry.id, { values })}
                        options={def.options.map((o) => ({ value: o, label: o }))}
                        maxTagCount="responsive"
                        optionFilterProp="label"
                      />
                    </Col>
                  </Row>
                </div>
              </Col>
            );
          })}
        </Row>
      )}

      {entries.some((e) => e.values.length === 0) && entries.length > 0 && (
        <Row style={{ marginTop: 12 }}>
          <Col span={24}>
            <Text type="warning" style={{ fontSize: 12 }}>
              Select at least one value per spec field — empty fields are ignored.
            </Text>
          </Col>
        </Row>
      )}
    </div>
  );
}
