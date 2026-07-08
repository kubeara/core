type FormErrorsSummaryProps = {
  formError?: string | null;
};

export function FormErrorsSummary({ formError }: FormErrorsSummaryProps) {
  if (!formError) {
    return null;
  }

  return (
    <div className="form-errors-summary" role="alert">
      <p className="form-errors-summary-message text-center">{formError}</p>
    </div>
  );
}
