import { EventEmitter } from 'events';

export type SecurityEventType =
  | 'login_success'
  | 'login_failed'
  | 'account_locked'
  | 'mfa_failed'
  | 'ip_blocked'
  | 'password_reset';

export interface SecurityEvent {
  type: SecurityEventType;
  message: string;
  ip?: string;
  email?: string;
  timestamp: string;
}

/** In-process pub/sub for security events — fans out to any connected admin SSE clients. */
export const securityEventBus = new EventEmitter();
securityEventBus.setMaxListeners(50); // one per connected admin dashboard tab

// Deliberately carries the full, unmasked email — unlike the Winston logs (see
// maskEmail in config/logger.ts), this event bus is in-memory only, fans out
// solely to connected admin SSE clients, and is never persisted to disk.
export const emitSecurityEvent = (event: Omit<SecurityEvent, 'timestamp'>): void => {
  securityEventBus.emit('event', { ...event, timestamp: new Date().toISOString() } satisfies SecurityEvent);
};
