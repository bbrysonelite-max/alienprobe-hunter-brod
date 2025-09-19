# Stripe Payment Integration Setup Guide
## For Alienprobo.ai Merchant Account

**Status:** ✅ **INTEGRATION COMPLETE** - Ready for activation with your existing Stripe account

---

## 🚀 Overview

Your Stripe payment integration is fully implemented and production-ready. This guide will help you connect your existing Alienprobo.ai Stripe merchant account to activate payments.

### What's Already Implemented

✅ **Complete Payment System**
- Payment configuration endpoint
- Stripe Checkout session creation
- Payment status checking and confirmation
- Webhook handling with signature verification
- Database schema for payment tracking
- Frontend payment integration
- Success/cancel page flows
- Content gating based on payment status
- Comprehensive error handling and logging

✅ **Security Features**
- Webhook signature verification
- Idempotent payment processing
- Secure environment variable handling
- Input validation and sanitization

---

## 📋 Required Setup Steps

### Step 1: Database Schema Migration

First, create the payments table in your database:

```bash
# Run this command in your project root
npm run db:push

# When prompted "Is payments table created or renamed from another table?"
# Select: "+ payments create table"
```

**Alternative:** If the interactive prompt doesn't work, manually select "create table" option.

### Step 2: Stripe Account Configuration

From your [Stripe Dashboard](https://dashboard.stripe.com/) for Alienprobo.ai:

#### 2.1 Get API Keys
1. Go to **Developers** → **API keys**
2. Copy your **Publishable key** (starts with `pk_`)
3. Copy your **Secret key** (starts with `sk_`)

#### 2.2 Configure Webhooks
1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. **Endpoint URL:** `https://your-domain.com/api/stripe/webhook`
4. **Listen to:** Select these events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)

### Step 3: Environment Variables

Add these environment variables to your Replit project:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_... # or sk_test_... for testing
VITE_STRIPE_PUBLIC_KEY=pk_live_... # or pk_test_... for testing
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional: Custom pricing (default is $49.00)
FULL_SCAN_PRICE_AMOUNT=4900  # Amount in cents
```

#### How to Add Environment Variables in Replit:
1. Open your Replit project
2. Click on **Tools** → **Secrets**
3. Add each variable with its value
4. Restart your application workflow

### Step 4: Verification

After setting environment variables, verify the integration:

```bash
# Check payment configuration
curl https://your-domain.com/api/payments/config

# Expected response (with payments enabled):
{
  "success": true,
  "paymentsEnabled": true,
  "publishableKeyPresent": true,
  "publicKey": "pk_live_...",
  "currency": "usd",
  "defaultAmount": 4900
}
```

---

## 🔧 API Endpoints Reference

### Payment Configuration
- **GET** `/api/payments/config`
- Returns payment settings and public key

### Create Checkout Session
- **POST** `/api/payments/checkout`
- Body: `{ "leadId": "uuid", "scanId": "uuid" }`
- Returns Stripe Checkout URL

### Payment Status
- **GET** `/api/payments/status/:scanId`
- Returns payment and access status

### Payment Confirmation
- **GET** `/api/payments/confirm/:sessionId`
- Confirms completed payment

### Webhook Handler
- **POST** `/api/stripe/webhook`
- Handles Stripe events with signature verification

---

## 🎯 How the Payment Flow Works

### 1. User Initiates Payment
- User views scan details on frontend
- Clicks "Buy Full Scan" button
- System creates Stripe Checkout session

### 2. Stripe Checkout
- User redirected to Stripe-hosted checkout
- Secure payment processing by Stripe
- Support for cards, digital wallets, etc.

### 3. Payment Completion
- Stripe webhook notifies your system
- Payment status updated in database
- Lead status changed to "converted"
- User gains access to full scan content

### 4. Content Gating
- Free users see limited scan insights
- Paid users see complete analysis
- Automatic access control based on payment status

---

## 🧪 Testing Guide

### Test Mode Setup
1. Use test API keys from Stripe Dashboard
2. Use test webhook endpoint for development
3. Test cards: `4242 4242 4242 4242` (Visa)

### Test Scenarios
1. **Successful Payment:**
   - Create scan → Initiate payment → Complete with test card
   - Verify access granted and content unlocked

2. **Failed Payment:**
   - Use declining test card: `4000 0000 0000 0002`
   - Verify graceful error handling

3. **Webhook Testing:**
   - Use Stripe CLI for local webhook testing
   - Verify events are processed correctly

---

## 🚨 Troubleshooting

### Payments Not Enabled
**Issue:** API returns `"paymentsEnabled": false`

**Solutions:**
1. Verify `STRIPE_SECRET_KEY` is set correctly
2. Check environment variable format (no extra spaces)
3. Restart application after adding variables

### Webhook Signature Verification Failed
**Issue:** Webhook returning 400 error

**Solutions:**
1. Verify `STRIPE_WEBHOOK_SECRET` matches Stripe Dashboard
2. Ensure webhook URL is exactly: `/api/stripe/webhook`
3. Check endpoint is publicly accessible

### Database Errors
**Issue:** "relation 'payments' does not exist"

**Solutions:**
1. Run `npm run db:push` to create missing tables
2. Verify database connection is working
3. Check DATABASE_URL environment variable

### Frontend Not Showing Payment Options
**Issue:** Payment button missing or disabled

**Solutions:**
1. Verify `VITE_STRIPE_PUBLIC_KEY` is set
2. Check browser console for JavaScript errors
3. Ensure API configuration endpoint is accessible

---

## 🔒 Security Considerations

### Production Checklist
- [ ] Use live Stripe API keys (not test keys)
- [ ] Webhook endpoint uses HTTPS
- [ ] Environment variables are secure (use Replit Secrets)
- [ ] Database access is restricted
- [ ] Enable Stripe's fraud detection features

### Recommended Stripe Settings
1. **Dashboard → Settings → Security**
   - Enable 3D Secure for enhanced fraud protection
   - Set up radar rules for risk management

2. **Dashboard → Settings → Business**
   - Complete business verification
   - Add business banking details

---

## 📊 Monitoring & Analytics

### Available Logs
- All payment events are logged with structured data
- Webhook processing includes idempotency tracking
- Error logs include detailed context for debugging

### Stripe Dashboard Monitoring
- Monitor transaction volume and success rates
- Set up alerts for failed payments or webhooks
- Review customer disputes and refunds

---

## 🔄 Production Deployment

### Final Activation Steps
1. ✅ Verify all environment variables are set
2. ✅ Run database migration (`npm run db:push`)
3. ✅ Test webhook endpoint is reachable
4. ✅ Complete a test transaction end-to-end
5. ✅ Switch to live Stripe API keys
6. ✅ Update webhook endpoint to production URL
7. ✅ Monitor first live transactions

### Go-Live Checklist
- [ ] Database schema migrated
- [ ] Live Stripe API keys configured
- [ ] Production webhook endpoint configured
- [ ] SSL certificate valid for webhook URL
- [ ] Test payment completed successfully
- [ ] Content gating verified working
- [ ] Monitoring and alerting configured

---

## 📞 Support

### Technical Implementation
- All code is production-ready and following security best practices
- Payment system includes comprehensive error handling
- Database schema supports all payment tracking requirements

### Stripe Account Support
- For account-specific issues, contact Stripe Support
- Use Stripe Dashboard for transaction monitoring
- Reference your botcraftwrks.ai merchant account

---

**Status:** 🎉 **READY FOR ACTIVATION**

Your Stripe integration is fully implemented. Simply add your API keys and webhook configuration to start accepting payments immediately.