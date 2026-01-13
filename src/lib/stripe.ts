import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  typescript: true,
});

export const PRICE_IDS = {
  pro: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
  premium: process.env.STRIPE_PRICE_PREMIUM_MONTHLY || '',
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || '',
} as const;

export type PriceTier = keyof typeof PRICE_IDS;

export interface StripeCustomer {
  id: string;
  email: string;
  name?: string;
}

export interface CreateCheckoutSessionParams {
  userId: string;
  userEmail: string;
  tier: PriceTier;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession({
  userId,
  userEmail,
  tier,
  successUrl,
  cancelUrl,
}: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
  const priceId = PRICE_IDS[tier];

  if (!priceId) {
    throw new Error(`Invalid tier: ${tier}`);
  }

  const session = await stripe.checkout.sessions.create({
    customer_email: userEmail,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      tier,
    },
    subscription_data: {
      metadata: {
        userId,
        tier,
      },
    },
    allow_promotion_codes: true,
    billing_address_collection: 'required',
  });

  return session;
}

export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session;
}

export async function getCustomerByEmail(email: string): Promise<StripeCustomer | null> {
  const customers = await stripe.customers.list({
    email,
    limit: 1,
  });

  if (customers.data.length === 0) {
    return null;
  }

  const customer = customers.data[0];
  return {
    id: customer.id,
    email: customer.email || email,
    name: customer.name || undefined,
  };
}

export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }
}

export async function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return await stripe.subscriptions.cancel(subscriptionId);
}

export async function updateSubscription(
  subscriptionId: string,
  newPriceId: string
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  return await stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0].id,
        price: newPriceId,
      },
    ],
    proration_behavior: 'always_invoice',
  });
}

export async function constructWebhookEvent(
  body: string | Buffer,
  signature: string
): Promise<Stripe.Event> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  }

  return stripe.webhooks.constructEvent(body, signature, webhookSecret);
}

// Helper to determine subscription tier from price ID
export function getTierFromPriceId(priceId: string): PriceTier | null {
  const entries = Object.entries(PRICE_IDS) as [PriceTier, string][];
  const found = entries.find(([_, id]) => id === priceId);
  return found ? found[0] : null;
}

// Helper to check if subscription is active
export function isSubscriptionActive(status: Stripe.Subscription.Status): boolean {
  return ['active', 'trialing'].includes(status);
}

// Helper to format amount for display
export function formatAmount(amount: number, currency: string = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}