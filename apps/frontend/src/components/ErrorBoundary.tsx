import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button, Surface } from "./primitives";
import { logger } from "../lib/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // In production, you might want to log this to an error reporting service
    logger.error("[ERROR_BOUNDARY] Caught component error", {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    this.setState({ error, errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Surface className="w-full max-w-2xl mx-auto mt-8 p-s-6 space-y-s-4">
          <div className="flex items-center gap-s-2 text-[var(--crit)] text-fs-h3 font-[600]">
            <AlertTriangle className="h-5 w-5" />
            Something went wrong
          </div>
          <p className="text-fs-body text-[var(--text-md)]">
            An unexpected error occurred. Please try refreshing the page or
            contact support if the problem persists.
          </p>
          {this.state.error && import.meta.env.DEV && (
            <details
              open
              className="rounded-r-2 bg-[var(--surface-1)] p-s-3 max-h-[60vh] overflow-auto"
            >
              <summary className="cursor-pointer text-fs-label uppercase tracking-[0.06em] text-[var(--text-lo)]">
                {this.state.error.message || "Error details"}
              </summary>
              <pre className="mt-s-2 whitespace-pre-wrap break-words font-mono text-fs-label text-[var(--text-md)]">
                {this.state.error.stack ?? this.state.error.message}
                {this.state.errorInfo?.componentStack ?? ""}
              </pre>
            </details>
          )}
          <Button
            onClick={this.handleReset}
            variant="accent"
            className="inline-flex items-center gap-s-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </Surface>
      );
    }

    return this.props.children;
  }
}
