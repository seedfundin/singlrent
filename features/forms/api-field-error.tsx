import type { ApiFieldErrors } from "@/lib/api";

type ApiFieldErrorProps = {
  errors: ApiFieldErrors;
  field: string;
};

/** Renders normalized backend validation feedback beside the matching control. */
export function ApiFieldError({ errors, field }: ApiFieldErrorProps) {
  const messages = errors[field];
  if (!messages?.length) return null;

  return <small className="field-error" role="alert">{[...new Set(messages)].join(" ")}</small>;
}
