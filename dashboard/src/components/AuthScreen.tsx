import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";

export function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <span className="brand-mark">
          <Icon name="key" />
        </span>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}
