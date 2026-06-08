type FormFieldLabelProps = {
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
};

export function FormFieldLabel({
  htmlFor,
  required = false,
  children,
}: FormFieldLabelProps) {
  return (
    <label htmlFor={htmlFor}>
      {children}
      {required && (
        <span className="form-field-required" aria-hidden="true">
          {" "}
          *
        </span>
      )}
    </label>
  );
}
