import { Component, type ReactNode } from "react";

import { reportUnexpectedError } from "../lib/diagnostics.js";
import { DiagnosticError } from "./diagnostic-error.js";

interface Props {
  readonly children: ReactNode;
}
interface State {
  readonly failed: boolean;
  readonly code?: string;
}

export class DiagnosticBoundary extends Component<Props, State> {
  public override state: State = { failed: false };

  public static getDerivedStateFromError(): State {
    return { failed: true };
  }

  public override componentDidCatch(): void {
    void reportUnexpectedError().then((code) => {
      if (code) this.setState({ failed: true, code });
    });
  }

  public override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="mx-auto w-full max-w-xl px-4 py-12">
          <DiagnosticError code={this.state.code} />
        </div>
      );
    }
    return this.props.children;
  }
}
