import React, { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class AudioErrorBoundary extends React.Component<Props, State> {
  props: Props;

  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-2xl bg-red-950/20 border border-red-900/30 text-red-500 font-mono text-sm">
          Song not available
        </div>
      );
    }

    return this.props.children;
  }
}
