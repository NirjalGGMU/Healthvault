import { Request, Response } from 'express';
import { SecurityEvent, securityEventBus } from '../utils/eventBus';
import logger from '../config/logger';

/**
 * GET /api/admin/events (auth + admin only)
 * Server-Sent Events stream of live security events (logins, lockouts, MFA
 * failures, IP blocks) — pushed to the admin dashboard in real time instead
 * of requiring a manual refresh of the log files.
 */
export const streamSecurityEvents = (req: Request, res: Response): void => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering so events arrive immediately
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Live feed connected' })}\n\n`);

  const onEvent = (event: SecurityEvent) => {
    res.write(`event: security\ndata: ${JSON.stringify(event)}\n\n`);
  };
  securityEventBus.on('event', onEvent);

  // Keep the connection alive through idle proxies/load balancers
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    securityEventBus.off('event', onEvent);
    logger.info(`ADMIN: live security feed closed for user ${req.user?.id ?? 'unknown'}`);
  });

  logger.info(`ADMIN: live security feed opened for user ${req.user?.id ?? 'unknown'}`);
};
