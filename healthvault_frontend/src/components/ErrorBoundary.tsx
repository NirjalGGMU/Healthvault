import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to whatever error-reporting service is wired up in production.
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center" role="alert">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl">
            ⚠
          </span>
          <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
          <p className="max-w-sm text-sm text-gray-500">
            An unexpected error occurred. You can try reloading the page — your data is safe.
          </p>
          <button type="button" onClick={this.handleReload} className="btn-primary">
            Reload HealthVault
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
