import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import Appointment from '../models/Appointment';
import logger from '../config/logger';
import { getStripe } from '../utils/stripe';

const FRONTEND_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

/**
 * POST /api/appointments/:id/checkout (auth + owning patient only)
 * Creates a Stripe-hosted Checkout Session for the appointment's deposit.
 * Card data never touches our servers — Stripe Checkout is a redirect to
 * Stripe's own PCI-DSS-compliant page, so this app carries none of that
 * compliance burden itself.
 */
export const createCheckoutSession = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ message: 'Payments are not configured on this server' });
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid appointment id' });
      return;
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      res.status(404).json({ message: 'Appointment not found' });
      return;
    }
    if (String(appointment.patientId) !== req.user.id) {
      logger.warn(`PAYMENT: user ${req.user.id} denied checkout on appointment ${id} (not owner)`);
      res.status(403).json({ message: 'Forbidden: you do not own this appointment' });
      return;
    }
    if (appointment.status === 'cancelled') {
      res.status(400).json({ message: 'This appointment has been cancelled' });
      return;
    }
    if (appointment.paymentStatus === 'paid') {
      res.status(400).json({ message: 'This appointment has already been paid for' });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      client_reference_id: String(appointment._id),
      metadata: { appointmentId: String(appointment._id) },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: appointment.currency,
            unit_amount: appointment.depositAmount,
            product_data: {
              name: 'HealthVault appointment deposit',
              description: `Deposit to secure your ${appointment.time} appointment on ${appointment.date.toDateString()}`,
            },
          },
        },
      ],
      success_url: `${FRONTEND_ORIGIN}/patient/appointments?payment=success&appointment=${String(appointment._id)}`,
      cancel_url: `${FRONTEND_ORIGIN}/patient/appointments?payment=cancelled&appointment=${String(appointment._id)}`,
    });

    appointment.stripeCheckoutSessionId = session.id;
    await appointment.save();

    logger.info(`PAYMENT: checkout session ${session.id} created for appointment ${id} by user ${req.user.id}`);

    res.status(200).json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Create checkout session error: ${message}`);
    res.status(500).json({ message: 'Failed to start checkout' });
  }
};

/**
 * POST /api/payments/webhook (public, Stripe-signed — no session/JWT auth)
 * Mounted in server.ts with express.raw() BEFORE the global express.json()
 * parser: Stripe's signature verification is computed over the exact raw
 * request bytes, so the body must not be parsed/re-serialized first.
 */
export const handleStripeWebhook = async (req: Request, res: Response): Promise<void> => {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    logger.error('PAYMENT: webhook received but Stripe/webhook secret is not configured');
    res.status(503).send('Webhook not configured');
    return;
  }

  const signature = req.headers['stripe-signature'];
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature as string, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`PAYMENT: webhook signature verification failed: ${message}`);
    res.status(400).send(`Webhook Error: ${message}`);
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const appointmentId = session.metadata?.appointmentId || session.client_reference_id;

      if (!appointmentId || !mongoose.Types.ObjectId.isValid(appointmentId)) {
        logger.error(`PAYMENT: webhook for session ${session.id} has no valid appointmentId`);
        res.status(200).json({ received: true }); // ack anyway — retrying won't fix a bad session
        return;
      }

      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        logger.error(`PAYMENT: webhook references appointment ${appointmentId} which no longer exists`);
        res.status(200).json({ received: true });
        return;
      }

      // Idempotent: Stripe may deliver the same event more than once.
      if (appointment.paymentStatus !== 'paid') {
        appointment.paymentStatus = 'paid';
        appointment.stripePaymentIntentId =
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
        await appointment.save();
        logger.info(`PAYMENT: appointment ${appointmentId} marked paid (session ${session.id})`);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`PAYMENT: webhook handling error: ${message}`);
    // 500 tells Stripe to retry delivery — appropriate here since this is our
    // failure (e.g. a transient DB error), not a bad/forged event.
    res.status(500).json({ message: 'Webhook handling failed' });
  }
};
