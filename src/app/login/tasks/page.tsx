import { Suspense } from "react";
import { AuthTasksPage } from "./tasks-client";

export default function LoginTasksPage() {
  return (
    <Suspense fallback={null}>
      <AuthTasksPage />
    </Suspense>
  );
}
