import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
