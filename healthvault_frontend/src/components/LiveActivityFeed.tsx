import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

const API_ORIGIN = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const MAX_EVENTS = 20;

interface SecurityEvent {
  type: 'login_success' | 'login_failed' | 'account_locked' | 'mfa_failed' | 'ip_blocked' | 'password_reset';
  message: string;
  ip?: string;
  email?: string;
  timestamp: string;
}

const EVENT_STYLE: Record<SecurityEvent['type'], string> = {
  login_success: 'badge-green',
  login_failed: 'badge-yellow',
  account_locked: 'badge-red',
  mfa_failed: 'badge-red',
  ip_blocked: 'badge-red',
  password_reset: 'badge-green',
};

/** Live feed of security events pushed from the backend via Server-Sent Events */
const LiveActivityFeed = () => {
  const { t } = useLanguage();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const source = new EventSource(`${API_ORIGIN}/api/admin/events`, { withCredentials: true });
    sourceRef.current = source;

    source.addEventListener('connected', () => setConnected(true));
    source.addEventListener('security', (e) => {
      try {
        const event = JSON.parse((e as MessageEvent).data) as SecurityEvent;
        setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
      } catch {
        // ignore malformed event payloads
      }
    });
    source.onerror = () => setConnected(false);

    return () => {
      source.close();
    };
  }, []);

  return (
    <div className="card !p-0">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white">{t('dashboard.admin.liveActivity')}</h2>
        <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-accent-500' : 'bg-gray-400'}`} />
          {connected ? t('dashboard.admin.liveConnected') : t('dashboard.admin.liveDisconnected')}
        </span>
      </div>
      {events.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('dashboard.admin.noLiveEvents')}
        </p>
      ) : (
        <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700">
          {events.map((event, i) => (
            <li key={`${event.timestamp}-${i}`} className="flex items-start justify-between gap-3 px-6 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-gray-900 dark:text-white">{event.message}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {new Date(event.timestamp).toLocaleTimeString()} {event.ip ? `· ${event.ip}` : ''}
                </p>
              </div>
              <span className={EVENT_STYLE[event.type] ?? 'badge-gray'}>{event.type.replace('_', ' ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LiveActivityFeed;
