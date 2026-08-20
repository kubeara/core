import { Navigate } from "react-router";

/**
 * Legacy configure route. The custom compose flow now lives on /compose.
 */
export function CustomComposeConfigurePage() {
  return <Navigate to="/compose" replace />;
}
