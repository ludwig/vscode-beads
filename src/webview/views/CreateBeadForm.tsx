/**
 * CreateBeadForm
 *
 * Create-a-new-bead form shown in the Details view when create mode is active
 * (vs-69z). Mirrors the Details edit-form fields and reuses the themed
 * ColoredSelect / LabelBadge components for VS Code-consistent styling.
 */

import React, { useCallback, useState } from "react";
import {
  BeadPriority,
  BeadType,
  CreateBeadFields,
  PRIORITY_COLORS,
  TYPE_COLORS,
  TYPE_LABELS,
  getTypeSortOrder,
  sortLabels,
} from "../types";
import { ColoredSelect, ColoredSelectOption } from "../common/ColoredSelect";
import { LabelBadge } from "../common/LabelBadge";
import { TypeBadge } from "../common/TypeBadge";
import { PriorityBadge } from "../common/PriorityBadge";
import { Icon } from "../common/Icon";

const TYPE_OPTIONS: ColoredSelectOption<BeadType>[] = (Object.keys(TYPE_LABELS) as BeadType[])
  .sort((a, b) => getTypeSortOrder(a) - getTypeSortOrder(b))
  .map((t) => ({ value: t, label: TYPE_LABELS[t], color: TYPE_COLORS[t] }));

const PRIORITY_OPTIONS: ColoredSelectOption<BeadPriority>[] = ([0, 1, 2, 3, 4] as BeadPriority[]).map((p) => ({
  value: p,
  label: `P${p}`,
  color: PRIORITY_COLORS[p],
  textColor: p === 2 ? "#1a1a1a" : "#ffffff",
}));

interface CreateBeadFormProps {
  userId?: string;
  onCreate: (fields: CreateBeadFields) => void;
  onCancel: () => void;
}

export function CreateBeadForm({ userId = "", onCreate, onCancel }: CreateBeadFormProps): React.ReactElement {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<BeadType>("task");
  const [priority, setPriority] = useState<BeadPriority>(2);
  const [description, setDescription] = useState("");
  const [design, setDesign] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [assignee, setAssignee] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState("");

  const canSubmit = title.trim().length > 0;

  const handleAddLabel = useCallback(() => {
    const value = newLabel.trim();
    if (value && !labels.includes(value)) {
      setLabels((prev) => [...prev, value]);
    }
    setNewLabel("");
  }, [newLabel, labels]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    const fields: CreateBeadFields = {
      title: title.trim(),
      type,
      priority,
      description: description.trim() || undefined,
      design: design.trim() || undefined,
      acceptanceCriteria: acceptanceCriteria.trim() || undefined,
      assignee: assignee.trim() || undefined,
      labels: labels.length > 0 ? labels : undefined,
    };
    onCreate(fields);
  }, [canSubmit, title, type, priority, description, design, acceptanceCriteria, assignee, labels, onCreate]);

  return (
    <div className="bead-details create-bead">
      <div className="details-header">
        <Icon name="plus" size={16} />
        <span className="bead-id-badge muted">New Issue</span>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={!canSubmit}>
            Create
          </button>
          <button className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="details-title">
        <input
          type="text"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
          className="title-input"
          placeholder="Issue title (required)"
        />
      </div>

      {/* Type / Priority / Assignee */}
      <div className="details-badges">
        <ColoredSelect
          value={type}
          options={TYPE_OPTIONS}
          onChange={(v) => setType(v as BeadType)}
          renderTrigger={() => <TypeBadge type={type} size="small" />}
          renderOption={(opt) => <TypeBadge type={opt.value as BeadType} size="small" />}
        />
        <ColoredSelect
          value={priority}
          options={PRIORITY_OPTIONS}
          onChange={(v) => setPriority(v as BeadPriority)}
          renderTrigger={() => <PriorityBadge priority={priority} size="small" />}
          renderOption={(opt) => <PriorityBadge priority={opt.value as BeadPriority} size="small" />}
        />
        <span className="assignee-trigger">
          <Icon name="user" size={10} className="person-icon" />
          <input
            type="text"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="text-input assignee-input"
            placeholder="Unassigned"
          />
        </span>
        {userId && assignee !== userId && (
          <button className="btn btn-sm" onClick={() => setAssignee(userId)}>
            Assign to me
          </button>
        )}
      </div>

      {/* Labels */}
      <div className="details-badges">
        <Icon name="tag" size={10} className="labels-icon" title="Labels" />
        <div className="add-label-inline">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="+ label"
            onKeyDown={(e) => e.key === "Enter" && handleAddLabel()}
          />
        </div>
        {sortLabels(labels).map((label) => (
          <LabelBadge
            key={label}
            label={label}
            onRemove={() => setLabels((prev) => prev.filter((l) => l !== label))}
          />
        ))}
      </div>

      {/* Description */}
      <div className="details-section">
        <h4>Description</h4>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="description-input"
          rows={4}
          placeholder="Description"
        />
      </div>

      {/* Design */}
      <div className="details-section">
        <h4>Design Notes</h4>
        <textarea
          value={design}
          onChange={(e) => setDesign(e.target.value)}
          className="description-input"
          rows={3}
          placeholder="Design considerations, architecture notes..."
        />
      </div>

      {/* Acceptance Criteria */}
      <div className="details-section">
        <h4>Acceptance Criteria</h4>
        <textarea
          value={acceptanceCriteria}
          onChange={(e) => setAcceptanceCriteria(e.target.value)}
          className="description-input"
          rows={3}
          placeholder="Definition of done..."
        />
      </div>
    </div>
  );
}
