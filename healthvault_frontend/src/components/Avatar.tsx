const API_ORIGIN = import.meta.env.VITE_API_URL || 'http://localhost:5001';

interface AvatarProps {
  avatarUrl?: string | null;
  name: string;
  size?: 'sm' | 'md';
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
};

/** Shows the user's uploaded photo, falling back to their initial in a circle */
const Avatar = ({ avatarUrl, name, size = 'md' }: AvatarProps) => {
  const sizeClasses = SIZE_CLASSES[size];

  if (avatarUrl) {
    return (
      <img
        src={`${API_ORIGIN}${avatarUrl}`}
        alt=""
        className={`${sizeClasses} shrink-0 rounded-full border border-gray-200 bg-gray-100 object-cover dark:border-gray-600 dark:bg-gray-700`}
      />
    );
  }

  return (
    <div
      className={`flex ${sizeClasses} shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 font-semibold text-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400`}
    >
      {name[0]?.toUpperCase() ?? '?'}
    </div>
  );
};

export default Avatar;
