interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
  label?: string;
}

const SIZE_CLASSES: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-[3px]',
  lg: 'h-12 w-12 border-4',
};

const LoadingSpinner = ({ size = 'md', fullScreen = false, label }: LoadingSpinnerProps) => {
  const spinner = (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <div
        className={`${SIZE_CLASSES[size]} animate-spin rounded-full border-primary-200 border-t-primary-600 dark:border-primary-900 dark:border-t-primary-400`}
      />
      {label && <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>}
      <span className="sr-only">Loading</span>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">{spinner}</div>
    );
  }
  return spinner;
};

export default LoadingSpinner;
