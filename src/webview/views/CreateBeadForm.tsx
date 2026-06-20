/**
 * CreateBeadForm
 *
 * Create-a-new-bead form shown in the Details view when create mode is active
 * (vs-69z), and as a standalone editor tab (vs-2tn.2). Purpose-built form
 * layout — a centered, max-width column with captioned fields and a tidy
 * Type/Priority/Assignee meta row — styled under the `.create-bead` namespace
 * so it doesn't lean on the read/edit Details classes (vs-2tn.1). Reuses the
 * themed ColoredSelect / LabelBadge / TypeBadge / PriorityBadge components.
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
    <div className="create-bead">
      <header className="create-bead-header">
        <div className="create-bead-heading">
          <span className="create-bead-mark" aria-hidden="true">
            <Icon name="plus" size={14} />
          </span>
          <h2 className="create-bead-title-text">New Issue</h2>
        </div>
        <div className="create-bead-actions">
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={canSubmit ? "Create issue (⌘↵)" : "Enter a title to create"}
          >
            Create
          </button>
        </div>
      </header>

      <div className="create-bead-body">
        {/* Title */}
        <div className="create-field">
          <label className="create-field-label" htmlFor="cb-title">
            Title <span className="create-required" title="Required">*</span>
          </label>
          <input
            id="cb-title"
            type="text"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
            className="create-input create-title-input"
            placeholder="What needs to be done?"
          />
        </div>

        {/* Type / Priority / Assignee */}
        <div className="create-meta">
          <div className="create-field create-field-inline">
            <span className="create-field-label">Type</span>
            <ColoredSelect
              value={type}
              options={TYPE_OPTIONS}
              onChange={(v) => setType(v as BeadType)}
              renderTrigger={() => <TypeBadge type={type} size="small" />}
              renderOption={(opt) => <TypeBadge type={opt.value as BeadType} size="small" />}
            />
          </div>
          <div className="create-field create-field-inline">
            <span className="create-field-label">Priority</span>
            <ColoredSelect
              value={priority}
              options={PRIORITY_OPTIONS}
              onChange={(v) => setPriority(v as BeadPriority)}
              renderTrigger={() => <PriorityBadge priority={priority} size="small" />}
              renderOption={(opt) => <PriorityBadge priority={opt.value as BeadPriority} size="small" />}
            />
          </div>
          <div className="create-field create-field-assignee">
            <span className="create-field-label">Assignee</span>
            <div className="create-assignee-row">
              <span className="create-control create-assignee-control">
                <Icon name="user" size={11} className="create-field-icon" />
                <input
                  type="text"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="create-assignee-input"
                  placeholder="Unassigned"
                />
              </span>
              {userId && assignee !== userId && (
                <button type="button" className="btn btn-sm create-assign-me" onClick={() => setAssignee(userId)}>
                  Assign to me
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Labels */}
        <div className="create-field">
          <span className="create-field-label">Labels</span>
          <div className="create-labels">
            <span className="create-control create-label-add">
              <Icon name="tag" size={11} className="create-field-icon" />
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Add a label…"
                onKeyDown={(e) => e.key === "Enter" && handleAddLabel()}
                className="create-label-input"
              />
            </span>
            {sortLabels(labels).map((label) => (
              <LabelBadge
                key={label}
                label={label}
                onRemove={() => setLabels((prev) => prev.filter((l) => l !== label))}
              />
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="create-field">
          <label className="create-field-label" htmlFor="cb-description">Description</label>
          <textarea
            id="cb-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="create-input create-textarea"
            rows={5}
            placeholder="Add more detail…"
          />
        </div>

        {/* Design */}
        <div className="create-field">
          <label className="create-field-label" htmlFor="cb-design">Design Notes</label>
          <textarea
            id="cb-design"
            value={design}
            onChange={(e) => setDesign(e.target.value)}
            className="create-input create-textarea"
            rows={3}
            placeholder="Design considerations, architecture notes…"
          />
        </div>

        {/* Acceptance Criteria */}
        <div className="create-field">
          <label className="create-field-label" htmlFor="cb-acceptance">Acceptance Criteria</label>
          <textarea
            id="cb-acceptance"
            value={acceptanceCriteria}
            onChange={(e) => setAcceptanceCriteria(e.target.value)}
            className="create-input create-textarea"
            rows={3}
            placeholder="Definition of done…"
          />
        </div>
      </div>
    </div>
  );
}
