import localized from "../locales/zh.json" with { type: "json" };
import { t, type LocalizedText } from "./i18n.js";
import { Button } from "./button.js";
import React from "react";
import { Modal } from "./modal.js";

export function ResourceForm({
  title,
  name,
  onNameChange,
  onSubmit,
  onClose,
  error,
  fieldsDisabled,
  submitDisabled,
  cancelDisabled,
  submitLabel,
  children,
}: {
  title: string;
  name: string;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  error?: LocalizedText;
  fieldsDisabled?: boolean;
  submitDisabled?: boolean;
  cancelDisabled?: boolean;
  submitLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <form
      className="resource-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h3>{title}</h3>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      <fieldset className="form-fields" disabled={fieldsDisabled}>
        <label>
          {t(localized["Name"])}
          <input
            autoFocus
            required
            maxLength={200}
            data-1p-ignore="true"
            autoComplete="off"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </label>
        {children}
      </fieldset>
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={submitDisabled}>
          {submitLabel}
        </Button>
        <Button type="button" disabled={cancelDisabled} onClick={onClose}>
          {t(localized["Cancel"])}
        </Button>
      </div>
    </form>
  );
}

export function ResourceDialog(
  props: React.ComponentProps<typeof ResourceForm>,
) {
  return (
    <Modal aria-label={props.title} onClose={props.onClose}>
      <ResourceForm {...props} />
    </Modal>
  );
}
