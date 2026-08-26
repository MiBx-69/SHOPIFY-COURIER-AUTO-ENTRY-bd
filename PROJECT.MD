# Shopify Multi-Courier Dispatch Platform

## 1. Project Overview

Build a professional, production-ready, mobile-first Shopify order dispatch management platform.

The application connects Shopify stores to a centralized dispatch dashboard and allows authorized users to:

- Install/connect their Shopify store
- Synchronize Shopify orders in near real time
- View all relevant Shopify order states
- Search, filter, sort, and inspect orders
- Dispatch orders to supported courier services
- Automatically select an enabled courier
- Send complete order/customer/product information to the courier
- Receive and store courier tracking IDs
- Write courier tracking information back to Shopify
- Track dispatch history and courier status
- Manage multiple courier integrations
- Manage staff and permissions
- Use passkeys for secure authentication
- Operate either as an embedded Shopify app or standalone web application

The application must be designed as a secure multi-tenant SaaS platform.

## 2. Core Principle

The system must treat Shopify as the source of truth for Shopify data.

Supabase acts as:

- Application database
- Local synchronized order store/cache
- Authentication provider
- Authorization layer
- Tenant isolation layer
- Dispatch state store
- Courier configuration store
- Audit/event store
- Real-time synchronization layer
- Backend execution environment through Edge Functions

Never make the frontend the source of truth.

Never trust frontend-provided tenant/shop IDs.

Never expose Shopify Admin API credentials or courier credentials to the browser.

---

# 3. Technology Stack

## Frontend

Use:

- Next.js
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- Responsive mobile-first design
- PWA capability
- Shopify App Bridge for embedded Shopify experience

The UI should feel like a modern native mobile application rather than a traditional admin dashboard.

## Backend

Use:

- Supabase PostgreSQL
- Supabase Auth
- Supabase Passkeys/WebAuthn
- Supabase Row Level Security
- Supabase Edge Functions
- Supabase Realtime
- Supabase Vault or equivalent secure secret storage where appropriate

## Shopify

Use:

- Shopify GraphQL Admin API
- Shopify OAuth/app installation
- Shopify webhooks
- Shopify FulfillmentOrder architecture
- Shopify metafields for persistent dispatch information

Do not build a REST-first architecture.

## Courier integrations

Create an abstraction layer supporting:

- REDX
- Pathao
- Steadfast

The architecture must make adding future courier providers easy.

---

# 4. Authentication Architecture

Use two distinct concepts:

## Supabase Auth

Responsible for:

> Who is this person?

Supported login:

- Passkey/WebAuthn
- Email-based fallback if required
- Future OAuth providers can be added without redesigning the authorization model

Passkey should be the preferred login method.

Example:

```text
Continue with Passkey
```

Users should be able to:

- Register multiple passkeys
- Rename passkeys
- Remove passkeys
- See last-used information
- Sign out other sessions

Important:

Supabase Passkey/WebAuthn support is currently experimental. Isolate passkey-specific implementation behind an authentication service so it can be changed without rewriting the application.

## Shopify

Responsible for:

> Which Shopify store is this user authorized to operate?

Do NOT ask merchants to manually enter:

- Shopify Admin API tokens
- API secrets
- API keys

The merchant should simply install/connect the Shopify app.

---

# 5. Shopify Installation Flow

Primary flow:

```text
Merchant
    ↓
Install Shopify App
    ↓
Shopify OAuth
    ↓
Merchant approves permissions
    ↓
Shopify callback
    ↓
Verify installation
    ↓
Identify Shopify shop
    ↓
Create/update tenant/store
    ↓
Securely store Shopify credentials
    ↓
Register required webhooks
    ↓
Start initial synchronization
    ↓
Open application dashboard
```

The installation must automatically associate the Shopify store with the correct application tenant.

No manual API configuration should be required for normal Shopify connection.

---

# 6. Standalone + Embedded Modes

The application must support two modes.

## Embedded Shopify Mode

Example:

```text
Shopify Admin
  ↓
Apps
  ↓
Dispatch Platform
```

When opened from Shopify, identify the installed shop securely and provide the correct application context.

## Standalone Mode

Example:

```text
https://app.example.com
```

User:

```text
Sign in with Passkey
```

Then show only stores/organizations the user is authorized to access.

If the user has multiple stores:

```text
Select Store

Universes RAW
universesraw.com

Other Store
otherstore.com
```

---

# 7. Multi-Tenant Architecture

The application must be multi-tenant from day one.

Recommended hierarchy:

```text
User
  ↓
Membership
  ↓
Organization
  ↓
Shop
  ↓
Orders
  ↓
Dispatches
```

Tables:

```text
organizations
shops
memberships
profiles
```

A user can belong to one or multiple organizations.

An organization can own one or multiple Shopify shops.

A shop has its own:

- Shopify connection
- Orders
- Courier configurations
- Dispatch records
- Webhooks
- Audit records
- Settings

---

# 8. Roles

Implement role-based access control.

Roles:

```text
owner
admin
manager
dispatcher
viewer
```

Permissions should include:

```text
view_orders
dispatch_orders
view_dispatch_history
manage_couriers
manage_shopify
manage_members
manage_settings
view_audit_logs
```

Example:

Owner:

- Everything

Admin:

- Everything except ownership transfer

Manager:

- Orders
- Dispatch
- Courier management
- Staff management

Dispatcher:

- View orders
- Dispatch orders
- View tracking

Viewer:

- Read-only orders and dispatch information

Never rely only on frontend UI hiding buttons.

Every sensitive operation must be authorized server-side.

---

# 9. Tenant Isolation

This is a critical requirement.

No user must ever be able to access another organization's data.

Never trust:

```text
shop_id
organization_id
user_id
```

coming from the frontend.

Determine authorization from:

```text
Supabase authenticated user
        ↓
membership
        ↓
organization
        ↓
shop
```

Every tenant-owned table must have appropriate RLS.

RLS must be enabled on all exposed tables.

Use indexed tenant/shop columns for performance.

The frontend should only query records it is authorized to access.

The backend must perform additional authorization checks for sensitive operations.

---

# 10. Database Structure

Create at minimum:

```text
profiles

organizations
memberships

shops
shopify_installations

orders
order_line_items

order_events

dispatches
dispatch_attempts

couriers
courier_configs
courier_shipments

webhook_events

audit_logs

sync_jobs
sync_errors

user_sessions / security events if needed
```

## Orders

Recommended fields:

```text
id
shop_id
shopify_order_id
shopify_order_gid
order_number

customer_name
customer_email
customer_phone

shipping_address
billing_address

subtotal_price
discount_price
shipping_price
tax_price
total_price
currency

financial_status
fulfillment_status

cancelled_at
closed_at

shopify_created_at
shopify_updated_at

dispatch_status

created_at
updated_at
```

## Order line items

```text
id
shop_id
order_id
shopify_line_item_id

product_id
variant_id

title
variant_title
sku
quantity
unit_price
total_price

product_snapshot
```

Store sufficient product/order snapshots so historical dispatch records remain understandable even if a product later changes.

---

# 11. Shopify Synchronization

Use two complementary systems.

## A. Webhooks

Webhooks provide near-real-time updates.

Subscribe to the appropriate Shopify order, product, fulfillment, and fulfillment-order events required by the application.

Webhook processing:

```text
Shopify
  ↓
Webhook
  ↓
Verify request
  ↓
Identify shop
  ↓
Find tenant
  ↓
Deduplicate event
  ↓
Process event
  ↓
Update Supabase
  ↓
Realtime notification
```

## B. Reconciliation

Webhooks are not enough as the only reliability mechanism.

Implement periodic reconciliation:

```text
Recently changed Shopify data
        ↓
Compare with Supabase
        ↓
Repair differences
```

This protects against:

- missed webhooks
- temporary outages
- webhook retries
- synchronization bugs
- manual Shopify changes

---

# 12. Webhook Idempotency

Create:

```text
webhook_events
```

Store:

```text
webhook_id
shop_id
topic
payload_hash
received_at
processed_at
status
error
```

If the same webhook is received twice, it must not duplicate data or trigger duplicate operations.

---

# 13. Order Status Model

Do not replace Shopify's native state.

Store Shopify states separately from application dispatch state.

Example:

```text
financial_status
fulfillment_status
fulfillment_order_status
dispatch_status
courier_status
```

Application dispatch statuses:

```text
not_dispatched
dispatching
dispatched
failed
cancelled
```

Courier statuses may include:

```text
created
picked_up
in_transit
delivered
returned
cancelled
unknown
```

Shopify status remains the Shopify status.

Dispatch status remains the application's dispatch status.

---

# 14. Main Dashboard

The main interface must be minimalist and mobile-first.

Navigation:

```text
Orders
Dispatched
Settings
```

Optional:

```text
Activity
```

Avoid excessive dashboard widgets.

The primary job of the app is:

> Find order → inspect → dispatch → track

---

# 15. Order Filters

Provide:

```text
All
Pending
Unfulfilled
On Hold
Partially Fulfilled
Fulfilled
Dispatched
Failed
Cancelled
```

Also provide filters:

```text
Date
Payment status
Fulfillment status
Dispatch status
Courier
Amount
Customer
```

Search:

```text
Order number
Customer name
Phone
Email
SKU
Tracking ID
```

Search should be fast and server-side.

---

# 16. Order Card

Mobile order card should show:

```text
#10582                         ৳1,850

Md. Rahim
017XXXXXXXX

2 items

Unfulfilled

[ Dispatch ]
```

Avoid unnecessary visual clutter.

Use clear status badges.

---

# 17. Order Detail

Display:

```text
Order #10582

Customer
Name
Phone
Email

Delivery
Full shipping address

Products
Product
Variant
SKU
Quantity
Price

Pricing
Subtotal
Discount
Shipping
Tax
Total

Shopify
Financial status
Fulfillment status

Dispatch
Courier
Tracking ID
Dispatch time
Courier status
```

Actions:

```text
Dispatch
Copy phone
Copy address
Open Shopify Order
```

---

# 18. Dispatch UX

When user presses Dispatch:

First validate:

```text
Order exists
Order belongs to current shop
Order is eligible
Not already dispatched
Required customer information exists
Courier is configured
```

Then show a confirmation sheet.

Example:

```text
Dispatch Order #10582

Customer
Md. Rahim

COD
৳1,850

Courier
Automatic

Selected courier:
REDX

[ Confirm Dispatch ]
```

For manual mode:

```text
Choose Courier

○ REDX
○ Pathao
○ Steadfast
```

---

# 19. Dispatch Backend

Never call courier APIs directly from the browser.

Use:

```text
Browser
  ↓
Authenticated request
  ↓
Supabase Edge Function
  ↓
Authorization
  ↓
Idempotency check
  ↓
Courier selection
  ↓
Courier API
  ↓
Save result
  ↓
Update Shopify
  ↓
Realtime update
  ↓
Browser
```

---

# 20. Idempotent Dispatch

This is mandatory.

Two users clicking Dispatch simultaneously must never create duplicate courier shipments.

Use:

- Database constraints
- Dispatch locks
- Unique shipment/order constraints
- Idempotency keys
- Transactional state transitions

Example:

```text
Order
  ↓
dispatching
  ↓
Courier request
  ↓
Success
  ↓
dispatched
```

If another request arrives while dispatching:

```text
Already processing
```

If already dispatched:

```text
Return existing shipment
```

Do not create a second courier entry.

---

# 21. Courier Architecture

Create a common interface:

```text
CourierProvider

validateConfig()
testConnection()
createShipment()
getTracking()
cancelShipment()
normalizeResponse()
```

Implement:

```text
RedXProvider
PathaoProvider
SteadfastProvider
```

Do not put courier-specific logic throughout the application.

The dispatch engine should work against the common interface.

---

# 22. Automatic Courier Selection

Settings:

```text
Automatic Courier
ON

Priority

1. REDX
2. Steadfast
3. Pathao
```

Support:

```text
priority
manual
```

Future-ready:

```text
round_robin
lowest_cost
area_based
weight_based
```

For automatic mode:

```text
Enabled couriers
        ↓
Check priority
        ↓
Select courier
        ↓
Create shipment
```

Do not silently fail over to another courier after a potentially successful but ambiguous API response.

If the first courier response is uncertain, reconcile before retrying.

This prevents duplicate shipments.

---

# 23. Courier Settings

Settings page:

```text
Courier Services

REDX
Connected ✓
Enabled ●

Pathao
Not configured
Disabled ○

Steadfast
Connected ✓
Enabled ●
```

Each courier:

```text
Status
Credentials
Connection test
Enable/disable
Priority
```

Never expose credentials after saving.

Display:

```text
••••••••••••
```

---

# 24. Courier Credentials

Courier secrets must be stored securely.

Never store them in:

- localStorage
- frontend environment variables
- browser state
- publicly readable tables

Use secure backend-only storage.

Only server-side Edge Functions may retrieve them.

---

# 25. Courier Payload

Normalize Shopify data into:

```text
order_id
order_number

customer_name
phone
email

full_address
city
area
postal_code

items:
  product_name
  variant
  sku
  quantity
  price

subtotal
discount
shipping
tax
total

cod_amount

notes
```

Then map the normalized payload into each courier's API format.

Do not assume REDX, Pathao, and Steadfast accept identical fields.

---

# 26. Dispatch Success

Courier returns:

```text
success
tracking_id
courier_reference
```

Store:

```text
dispatch
courier_shipment
tracking_id
courier_reference
timestamp
request/response metadata where safe
```

Then update Shopify.

---

# 27. Shopify Tracking

After successful courier creation:

```text
Courier
  ↓
Tracking ID
  ↓
Supabase
  ↓
Shopify
```

Store persistent dispatch information in Shopify metafields.

Recommended namespace:

```text
dispatch
```

Fields:

```text
courier
tracking_id
courier_reference
dispatch_status
dispatched_at
```

Where appropriate, also use Shopify's fulfillment/tracking APIs so the merchant can track fulfillment from Shopify itself.

Never overwrite Shopify data incorrectly.

---

# 28. Dispatched Orders

Successful dispatch automatically moves the order into:

```text
Dispatched
```

Do not physically delete it from orders.

Instead:

```text
dispatch_status = dispatched
```

This preserves history.

Dispatched card:

```text
#10582                       ৳1,850

Md. Rahim

REDX
RX123456789

Dispatched
Today 12:43 PM

[ View ]
```

---

# 29. Tracking

Add a dedicated tracking view.

Show:

```text
Order
Customer
Courier
Tracking ID
Dispatch date

Courier status
Last update

Timeline
────────────
Dispatched
   ↓
Picked Up
   ↓
In Transit
   ↓
Delivered
```

If courier tracking APIs support status polling/webhooks, synchronize tracking information.

---

# 30. Failed Dispatch

Never silently lose failures.

Example:

```text
Dispatch Failed

REDX

Unable to create shipment.

Reason:
Invalid phone number

[ Retry ]
[ Choose Another Courier ]
```

Store every attempt.

```text
dispatch_attempts
```

Include:

```text
courier
started_at
completed_at
status
error_code
safe_error_message
```

Never store sensitive secrets in logs.

---

# 31. Smart Retry

Retries must be safe.

Do not blindly retry an external courier request if the result is unknown.

Use:

```text
success
known_failure
unknown
```

For `unknown`:

```text
Check courier using reference/order ID
       ↓
Shipment exists?
       ↓
YES → save tracking
NO → retry safely
```

This is especially important for production reliability.

---

# 32. Product Change Handling

Shopify remains the source of truth.

If a product is:

- edited
- renamed
- deleted
- price changed
- SKU changed
- variant changed

the system should receive/synchronize the appropriate Shopify updates.

Historical orders must retain a product snapshot so old dispatch records don't become unreadable after a product is deleted.

Example:

```text
Product currently:
"Premium Trouser"

Historical order:
"Premium Trouser"
SKU: PT-BLK-L
Price: ৳1,250
```

Even if Shopify later deletes the product.

---

# 33. Order Editing

If an order changes in Shopify:

```text
Shopify
 ↓
Webhook
 ↓
Sync
 ↓
Supabase
 ↓
Realtime
 ↓
UI updates
```

If the order is already dispatched, do not silently modify the courier shipment.

Show:

```text
Order changed after dispatch
```

and require an appropriate action.

---

# 34. Realtime UX

Use Supabase Realtime for:

- New orders
- Updated orders
- Dispatch progress
- Dispatch success
- Dispatch failures
- Courier status changes
- Sync status

Example:

```text
Employee A dispatches order
        ↓
Supabase
        ↓
Employee B dashboard updates
```

No manual refresh should be required for normal events.

---

# 35. Sync Status

Settings → Shopify:

```text
Synchronization

● Healthy

Last successful sync
12:54 PM

Orders synchronized
12,842

Webhooks
12 / 12 healthy

Pending sync jobs
0

Failed sync jobs
0

[ Sync Now ]
```

If synchronization fails:

```text
⚠ Sync needs attention

Last successful sync:
12:21 PM

[ View Details ]
[ Retry ]
```

---

# 36. Activity / Audit Log

Implement a professional audit system.

Record important actions:

```text
User logged in
Shopify connected
Shopify disconnected
Courier enabled
Courier credentials changed
Order dispatched
Dispatch failed
Dispatch retried
Tracking updated
Order manually synchronized
Staff invited
Role changed
```

Example:

```text
Today

12:43 PM
Moinul dispatched #10582
REDX · RX123456789

12:40 PM
REDX connection tested successfully

12:10 PM
Staff member added
```

---

# 37. Security

Security is a first-class requirement.

Use:

- HTTPS
- Secure cookies
- HTTP-only cookies where appropriate
- CSRF protection where applicable
- Content Security Policy
- Rate limiting
- Input validation
- Output encoding
- Server-side authorization
- Supabase RLS
- Encrypted secrets
- Webhook verification
- Idempotency
- Audit logging
- Least-privilege Shopify scopes

Never expose:

```text
Supabase service role key
Shopify Admin token
Courier secrets
Encryption keys
```

to the client.

---

# 38. RLS Requirements

Every tenant-owned table must have RLS.

Example logical rule:

```text
authenticated user
    ↓
membership
    ↓
organization
    ↓
shop
    ↓
record.shop_id
```

A user must not be able to:

- change shop_id
- change organization_id
- read another shop
- insert an order into another shop
- modify another shop's dispatch
- access another shop's courier credentials

RLS must remain the final database-level defense.

---

# 39. Backend Service Role

Supabase service-role credentials may be used only in trusted backend environments.

Never send them to:

```text
browser
mobile client
public API
```

Use service-role access only where required for:

- webhook processing
- Shopify synchronization
- courier API calls
- secure administrative operations

All such operations must still perform explicit tenant validation.

---

# 40. Encryption

Sensitive information should be encrypted or protected appropriately.

Sensitive data includes:

- Shopify credentials
- Courier API credentials
- Courier passwords/tokens
- Private integration data

Do not claim that ordinary database access is "encrypted" merely because HTTPS is used.

Implement:

```text
Encryption in transit
+
Encryption at rest
+
Application-level protection for sensitive secrets
+
Strict access controls
```

---

# 41. Performance

The app must feel instant.

Use:

- Server-side pagination
- Indexed queries
- Debounced search
- Cursor pagination where appropriate
- Optimistic UI for safe local state changes
- Realtime updates
- Lazy loading
- Virtualized lists if order volume becomes large
- Background synchronization
- Database indexes

Do not load thousands of orders into the browser.

---

# 42. Mobile-first UX

Primary target:

```text
390px
```

The application must work beautifully on:

- iPhone
- Android
- tablet
- desktop

Mobile should not be a shrunken desktop layout.

Use:

- bottom navigation
- sticky action buttons
- bottom sheets
- large touch targets
- swipe-friendly cards
- compact typography
- clear status indicators

---

# 43. Desktop UX

On desktop:

```text
Sidebar
    ↓
Orders
Dispatched
Activity
Settings
```

Orders may become a table/list layout.

Do not create a completely separate application.

Use responsive components.

---

# 44. Design Language

Design should be:

- Minimal
- Professional
- Clean
- Fast
- Neutral
- High contrast
- Modern
- Functional

Avoid:

- excessive gradients
- glassmorphism everywhere
- giant cards
- excessive shadows
- unnecessary animations
- excessive dashboard charts

Use animation only when it improves feedback.

---

# 45. Recommended UX Features

Add:

## Keyboard shortcuts

Desktop:

```text
/
Search

D
Dispatch selected order

Enter
Open order

Esc
Close dialog
```

## Quick actions

From order card:

```text
Dispatch
Copy phone
Copy address
Open Shopify
```

## Bulk selection

Allow:

```text
Select multiple orders
```

Then:

```text
Bulk dispatch
```

But bulk dispatch must have strong confirmation and per-order failure reporting.

Example:

```text
20 selected

18 dispatched
1 failed
1 skipped
```

Never let one failure hide the rest.

---

# 46. Bulk Dispatch Safety

Bulk dispatch must:

- Validate every order
- Prevent duplicates
- Respect courier limits
- Process asynchronously
- Show individual results
- Support retrying only failed orders

Example:

```text
Bulk Dispatch

20 orders

REDX
18 success
1 failed
1 already dispatched

[ View Results ]
```

---

# 47. Order Notes

Allow internal notes separate from Shopify customer-visible notes.

Example:

```text
Internal note:
Customer requested evening delivery.
```

Clearly distinguish:

```text
Internal
```

from:

```text
Shopify customer-facing note
```

Never accidentally expose internal notes to customers.

---

# 48. Saved Filters

Allow staff to save frequently used filters:

```text
Today's Pending
High Value Orders
Dhaka Orders
COD Orders
Failed Dispatches
```

This improves operational speed.

---

# 49. Dashboard Quick Statistics

Keep statistics minimal.

Example:

```text
Today

Pending       82
Dispatched    143
Failed          4
Delivered      96
```

Avoid turning the app into an analytics dashboard.

The main purpose remains dispatch operations.

---

# 50. Notifications

Add subtle notifications:

```text
✓ Order dispatched
⚠ Dispatch failed
✓ Shopify synchronized
⚠ Shopify sync delayed
```

For important operational failures, support persistent alerts.

---

# 51. Empty States

Professional empty states:

```text
No pending orders

You're all caught up.
```

Courier:

```text
No courier connected

Connect REDX, Pathao, or Steadfast
to start dispatching.
```

---

# 52. Error Handling

Never show raw API errors to users.

Bad:

```text
HTTP 422:
{"error":"validation_error"...}
```

Good:

```text
Unable to create shipment.

The customer's phone number appears invalid.

[ Edit Order ]
[ Try Another Courier ]
```

Store technical details internally.

---

# 53. Shopify Settings

Settings should contain:

```text
Shopify

Store
Connected store

Connection status
Healthy

Synchronization
Last sync
Sync frequency/status

Webhooks
Healthy

Permissions
Granted scopes

[ Sync Now ]

[ Reconnect ]

[ Disconnect ]
```

Do not allow the merchant to manually paste credentials.

---

# 54. Courier Settings

```text
Courier Services

REDX
Enabled
Connected

Pathao
Disabled
Not configured

Steadfast
Enabled
Connected
```

Allow drag-and-drop priority.

---

# 55. General Settings

```text
General

Default currency
BDT

Default dispatch mode
Automatic

Order list default
Pending

Timezone
Asia/Dhaka
```

Use store-specific timezone where appropriate.

---

# 56. Security Settings

```text
Security

Passkeys
2 registered

Active sessions
3

Recent activity

[ Manage Passkeys ]
[ Manage Sessions ]
```

Optionally add:

```text
Require re-authentication for sensitive settings
```

---

# 57. Staff Management

```text
Team

Moinul
Owner

Staff 01
Dispatcher

Staff 02
Viewer

[ Invite Member ]
```

Invitation system should be secure.

Do not let a dispatcher grant themselves admin permissions.

---

# 58. Shopify Webhook Security

Validate Shopify webhook authenticity using Shopify's recommended verification mechanism.

Do not process unverified webhook requests.

Webhook processing must also identify the originating shop and map it to the correct tenant.

---

# 59. API Security

Create backend API boundaries such as:

```text
/api/orders
/api/orders/:id
/api/dispatch
/api/couriers
/api/shopify
/api/webhooks
```

Sensitive operations should ultimately execute through secure backend/Edge Functions.

Every endpoint must perform:

```text
Authentication
Authorization
Tenant validation
Input validation
Rate limiting where appropriate
```

---

# 60. Database Indexing

Index common fields:

```text
orders.shop_id
orders.shopify_order_id
orders.order_number
orders.dispatch_status
orders.fulfillment_status
orders.shopify_updated_at

dispatches.shop_id
dispatches.order_id
dispatches.tracking_id

memberships.user_id
memberships.organization_id

webhook_events.shop_id
webhook_events.webhook_id
```

Use composite indexes where query patterns justify them.

---

# 61. Search

Search should support:

```text
#10582
017XXXXXXXX
Md. Rahim
customer@email.com
SKU123
RX123456789
```

Use proper indexed search strategy.

Do not fetch the entire order database and filter in JavaScript.

---

# 62. Sync Architecture

Create a sync service:

```text
ShopifySyncService

initialSync()
syncOrders()
syncOrder()
syncProducts()
syncFulfillment()
reconcile()
```

Keep synchronization logic separate from UI code.

---

# 63. Courier Service Architecture

Create:

```text
CourierService
CourierRegistry
CourierSelector
DispatchService
TrackingService
```

Example:

```text
DispatchService
      ↓
CourierSelector
      ↓
CourierRegistry
      ↓
RedXProvider / PathaoProvider / SteadfastProvider
```

This architecture should make future courier integrations straightforward.

---

# 64. Logging

Use structured logging.

Every backend operation should include:

```text
request_id
shop_id
organization_id
user_id
operation
status
duration
```

Never log:

- passwords
- API tokens
- access tokens
- private keys
- full payment data

---

# 65. Observability

Build basic health indicators:

```text
Shopify API
● Healthy

Webhooks
● Healthy

Supabase
● Healthy

REDX
● Healthy

Pathao
● Healthy

Steadfast
● Healthy
```

For individual stores, show their actual connection/sync health.

---

# 66. Offline/Network Handling

Because this is mobile-first, gracefully handle temporary network loss.

Show:

```text
Offline

Changes will retry when connection returns.
```

Do not pretend a dispatch succeeded while the server response is unknown.

For dispatch operations:

```text
Processing...
```

must remain until a definitive server result is received.

---

# 67. Confirmation Rules

Require confirmation for:

- Dispatch
- Bulk dispatch
- Disconnect Shopify
- Remove courier
- Delete passkey
- Change owner/admin permissions

Do not require confirmation for harmless actions such as:

- Copy phone
- Copy address
- Open order

---

# 68. Shopify Order Eligibility

Before dispatch, validate:

```text
Order exists
Order belongs to current shop
Order not cancelled
Order not already dispatched
Required delivery data exists
Required products exist
Courier supports required shipment
```

Make eligibility rules configurable where appropriate.

---

# 69. COD Handling

Because courier workflows commonly use COD, explicitly calculate:

```text
subtotal
discount
shipping
tax
total
COD amount
```

Never assume:

```text
COD = subtotal
```

Use Shopify's actual order financial data.

---

# 70. Data Accuracy

For monetary values:

- Avoid floating-point calculations
- Store appropriate decimal values
- Preserve Shopify's values
- Use integer minor units where appropriate

Currency:

```text
BDT
```

must be handled consistently.

---

# 71. Time Handling

Store timestamps in UTC where practical.

Display using the store/user timezone.

Default Bangladesh store timezone:

```text
Asia/Dhaka
```

Do not hardcode Bangladesh timezone into the entire system because the application may eventually serve international Shopify stores.

---

# 72. Testing

Build automated tests for:

## Authentication

- Login
- Passkey
- Session expiry
- Unauthorized access

## Tenant isolation

Critical tests:

```text
User A cannot access Store B
User B cannot access Store A
```

Test this at database/RLS and API levels.

## Shopify

- OAuth
- Callback
- Webhook
- Duplicate webhook
- Order update
- Product deletion
- Fulfillment update

## Dispatch

- Success
- Failure
- Timeout
- Duplicate click
- Concurrent dispatch
- Unknown courier response
- Retry

## Courier

Mock:

- REDX
- Pathao
- Steadfast

Test normalized responses.

---

# 73. Security Testing

Before production verify:

```text
RLS enabled on every tenant table
No service key in frontend
No Shopify token in frontend
No courier secret in frontend
No cross-tenant queries
No insecure direct object references
Webhook validation works
Rate limiting works
Authorization works on every sensitive action
```

Perform adversarial tests against:

```text
shop_id manipulation
order_id manipulation
organization_id manipulation
user_id manipulation
```

---

# 74. Environment Variables

Never commit secrets.

Example:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

SUPABASE_SERVICE_ROLE_KEY

SHOPIFY_CLIENT_ID
SHOPIFY_CLIENT_SECRET
SHOPIFY_APP_URL

ENCRYPTION_KEY

REDX_API_URL
PATHAO_API_URL
STEADFAST_API_URL
```

Courier credentials belonging to individual merchants must NOT be environment variables.

They belong in secure per-tenant configuration.

---

# 75. Code Organization

Use a clean structure similar to:

```text
src/
  app/
  components/
  features/
    auth/
    shopify/
    orders/
    dispatch/
    couriers/
    settings/
    team/
  lib/
    supabase/
    shopify/
    security/
    validation/
  services/
    dispatch/
    courier/
    synchronization/
  types/

supabase/
  migrations/
  functions/
```

Keep business logic out of React components.

---

# 76. Validation

Use a schema validation library such as Zod.

Validate:

- API input
- courier configuration
- order dispatch payload
- Shopify webhook payload
- user settings
- staff permissions

Never trust external API responses without validation.

---

# 77. UI Component Strategy

Build reusable components:

```text
OrderCard
OrderList
OrderDetail
StatusBadge
DispatchButton
DispatchSheet
CourierSelector
TrackingCard
SearchBar
FilterBar
BottomNavigation
SettingsSection
ConnectionStatus
ConfirmDialog
Toast
EmptyState
LoadingState
ErrorState
```

---

# 78. Loading Experience

Avoid blank screens.

Use:

- Skeleton loaders
- Optimistic UI only where safe
- Inline progress states
- Proper error states

Example:

```text
Dispatching...

Creating courier shipment
✓ Order validated
✓ Courier selected
● Creating shipment
○ Updating Shopify
```

This provides confidence to staff.

---

# 79. Dispatch Progress

Show progress when appropriate:

```text
Dispatching

✓ Order validated
✓ REDX selected
✓ Shipment created
✓ Tracking received
✓ Shopify updated

Dispatch complete
```

If Shopify update fails after courier creation:

```text
Courier shipment created ✓

Shopify update requires attention ⚠

Tracking ID:
RX123456789

[ Retry Shopify Update ]
```

Never report the entire operation as failed if the courier shipment was actually created.

---

# 80. Data Consistency

The dispatch process should understand partial success.

Possible states:

```text
courier_created
shopify_update_pending
completed
failed
unknown
```

This is better than a simplistic true/false result.

---

# 81. Admin Recovery Tools

Create internal/admin-only tools for:

```text
Re-sync shop
Retry webhook
Retry Shopify update
Reconcile order
Inspect dispatch attempt
Disable courier
```

These must be permission protected.

---

# 82. Production Readiness

Before calling the project production-ready:

- Complete RLS
- Complete authorization
- Test Shopify OAuth
- Test webhooks
- Test courier APIs
- Test duplicate dispatch
- Test concurrent dispatch
- Test network failure
- Test expired credentials
- Test Shopify API rate limits
- Test large order volume
- Test mobile browsers
- Test Safari
- Test Chrome
- Test Android
- Test iOS
- Test desktop
- Add error monitoring
- Add structured logging
- Add database backups
- Document deployment

---

# 83. Developer Rules

When implementing:

1. Do not create fake Shopify data in production code.
2. Do not mock courier APIs in the real integration path.
3. Mocks are allowed only in tests/development.
4. Never expose secrets.
5. Never bypass RLS simply to make a feature work.
6. Never trust frontend tenant IDs.
7. Never directly call courier APIs from the browser.
8. Never use Shopify tokens in client-side code.
9. Never duplicate courier integration logic.
10. Never delete historical dispatch records unnecessarily.
11. Never silently retry unknown courier responses.
12. Never mark a shipment successful without a definitive result.
13. Never allow duplicate dispatches.
14. Never use raw SQL without considering RLS/security.
15. Never use `service_role` in frontend code.

---

# 84. Development Strategy

Build incrementally.

## Phase 1

Build:

- Next.js foundation
- Supabase connection
- Authentication
- Passkey flow
- Organization
- Membership
- Shop model
- RLS
- Basic UI

## Phase 2

Build Shopify:

- Shopify app configuration
- OAuth
- Installation
- Shop creation
- GraphQL integration
- Initial order synchronization
- Webhooks
- Reconciliation
- Order dashboard

## Phase 3

Build dispatch:

- Dispatch database
- Dispatch service
- Idempotency
- Dispatch UI
- Shopify metafields
- Tracking

## Phase 4

Build couriers:

- Courier interface
- REDX
- Pathao
- Steadfast
- Credential storage
- Connection testing
- Automatic selection

## Phase 5

Build advanced features:

- Team management
- Roles
- Bulk dispatch
- Saved filters
- Activity logs
- Tracking timeline
- Notifications
- Health monitoring

## Phase 6

Production hardening:

- Security audit
- RLS audit
- Performance optimization
- Rate limiting
- Error monitoring
- Recovery tools
- Automated tests
- Deployment

---

# 85. Definition of Done

The project is considered complete only when:

### Authentication

- Passkey login works
- Sessions work securely
- Users can manage passkeys

### Shopify

- Merchant can install app
- Merchant does not manually enter API credentials
- Store is automatically identified
- Orders synchronize
- Webhooks synchronize changes
- Reconciliation repairs missed changes

### Multi-tenancy

- Multiple stores can use the same application
- Each store has isolated data
- RLS prevents cross-store access
- Roles work correctly

### Orders

- All required Shopify states display correctly
- Search works
- Filters work
- Order details are accurate
- Product changes synchronize

### Dispatch

- User can dispatch
- Automatic courier selection works
- Duplicate dispatch is impossible
- Courier tracking ID is saved
- Shopify is updated
- Dispatched order moves automatically
- Failed dispatches are recoverable

### Couriers

- REDX works
- Pathao works
- Steadfast works
- Credentials are secure
- Enable/disable works
- Priority works
- Connection testing works

### Security

- No secrets in browser
- RLS enabled
- Tenant isolation verified
- Backend authorization verified
- Webhook validation implemented
- Audit logging implemented

### UX

- Mobile-first
- Fast
- Minimal
- Responsive
- Accessible
- Clear loading/error states
- No unnecessary UI complexity

---

# 86. Final Product Vision

The finished application should feel like:

> A professional, extremely fast Shopify dispatch terminal for merchants and warehouse teams.

The primary workflow should be:

```text
LOGIN
  ↓
SHOPIFY STORE
  ↓
PENDING ORDERS
  ↓
OPEN ORDER
  ↓
DISPATCH
  ↓
AUTOMATIC COURIER
  ↓
TRACKING ID
  ↓
SHOPIFY UPDATED
  ↓
DISPATCHED
```

The user should not need to understand:

- OAuth
- API tokens
- Webhooks
- Supabase
- RLS
- Edge Functions
- Encryption
- Courier APIs

All complexity belongs in the backend.

The interface should remain simple.

---

# 87. AI Coding Agent Instructions

You are building a production-grade application, not a prototype.

Before writing implementation code:

1. Inspect the repository.
2. Determine the existing framework and structure.
3. Create a technical implementation plan.
4. Identify required environment variables.
5. Design the database schema.
6. Design RLS policies.
7. Design Shopify OAuth/install flow.
8. Design webhook architecture.
9. Design courier abstraction.
10. Design dispatch state machine.
11. Design idempotency strategy.
12. Design authorization model.
13. Then implement incrementally.

Do not generate the entire application as one untested file.

Keep modules small and maintainable.

After each major phase:

- run type checking
- run linting
- run tests
- verify database migrations
- verify RLS
- verify API authorization
- verify build

Never hide errors.

Never replace real security with TODO comments.

When a third-party API behavior is uncertain, consult its current official documentation before implementing it.

For Shopify-specific implementation, use the current Shopify developer documentation rather than outdated tutorials.

For Supabase-specific implementation, use current Supabase documentation.

---

# 88. Important Product Decisions

Use these decisions unless a technical reason requires changing them:

```text
Authentication:
Supabase Auth + Passkey

Store connection:
Shopify OAuth / App Installation

Database:
Supabase PostgreSQL

Authorization:
RLS + server-side authorization

Backend:
Supabase Edge Functions

Shopify:
GraphQL Admin API + Webhooks

Realtime:
Supabase Realtime

Secrets:
Secure backend-only secret storage

Courier:
Provider abstraction

Dispatch:
Idempotent server-side operation

UI:
Mobile-first minimalist

Architecture:
Multi-tenant SaaS

Source of truth:
Shopify for Shopify data
Supabase for application/dispatch state
```

---

# 89. Most Important Security Requirement

At every point in the application, answer:

> "How do we know this user is allowed to access this shop?"

Never assume it.

Verify:

```text
Supabase session
        ↓
User
        ↓
Membership
        ↓
Organization
        ↓
Shop
        ↓
Requested resource
```

If any relationship fails:

```text
403 Forbidden
```

Do not return partial data.

Do not leak whether another tenant's resource exists.

---

# 90. Build Quality Target

The target is not:

> "Make the feature work."

The target is:

> "Build a secure, multi-tenant, production-ready Shopify dispatch SaaS that can safely be used by many independent Shopify merchants simultaneously."

Prioritize:

1. Security
2. Data isolation
3. Data correctness
4. Dispatch reliability
5. Shopify synchronization
6. Courier reliability
7. Performance
8. Mobile UX
9. Maintainability
10. Visual polish

Never sacrifice tenant isolation or dispatch correctness for UI convenience.

## 36. Updates (Aug 2026)
- Shopify Sync has been repaired to perform initial reconciliation properly.
- Courier Credentials are now managed completely within the UI and securely encrypted into courier_secrets without requiring environment variables.
- Dispatch logic correctly processes  utomatic_courier preference and priority drag-and-drop ordering.
- Shopify App Bridge is conditionally rendered only in embedded mode.
- Idempotency locks are fully implemented for Shopify dispatch.

- Shopify Sync API Breaking Changes Fix: Removed obsolete `orderNumber` field and restricted `customer` field from GraphQL initialSync, replacing them with compliant alternatives, allowing order ingestion to succeed.

---

# 91. Advanced Order Management & Dispatch System (Aug 2026 Enhancement)

### 1. Ready to Dispatch Primary Queue
- **Default Operational Tab**: Orders dashboard defaults to the `Ready to Dispatch` queue.
- **Criteria**: Orders must have `cancelled_at IS NULL`, `fulfillment_status != 'FULFILLED'`, `dispatch_status NOT IN ('dispatched', 'cancelled')`, valid customer phone, and valid delivery address.
- **Cancelled Order Isolation**: Cancelled Shopify orders are strictly excluded from Unfulfilled, Pending, Ready to Dispatch, and Bulk operations. They appear strictly in the `Cancelled` or `All` views.

### 2. "Remove from Dispatch" (Skip) & "Restore to Dispatch"
- **Operational Intent**: Staff can exclude eligible orders from the active dispatch queue (e.g. pending customer confirmation or fraud review) without deleting, cancelling, or altering the Shopify order.
- **Mechanism**:
  - `POST /api/orders/skip`: Records `dispatch_skipped` event with reason, timestamp, and actor in `order_events`. Order vanishes from active queues and appears in `Skipped`.
  - `POST /api/orders/restore`: Records `dispatch_restored` event and returns order to `not_dispatched`, restoring it to the active queue.
  - **Shopify Safety**: Neither action ever modifies Shopify order data or tags.

### 3. Courier Dispatch Cancellation
- **Operational Intent**: Cancel application courier dispatches for orders that are `dispatching` or `dispatched` without cancelling the merchant's Shopify order.
- **Mechanism**:
  - `POST /api/dispatch/cancel`:
    - If a courier shipment exists, invokes provider `cancelShipment(trackingId, credentials)` via API (supported by REDX and Pathao).
    - If the courier does not support online cancellation (e.g. Steadfast), the system returns an informative notice: `"Courier cancellation is not supported for this shipment."` rather than falsely marking it cancelled.
    - If cancelled, updates `dispatches` and `orders` to `cancelled`, and logs an event in `order_events`.

### 4. Application Dispatch State Machine
- **Application Dispatch States**:
  - `not_dispatched`: Initial synchronized state.
  - `dispatching`: Atomically claimed for processing.
  - `dispatched`: Successfully created with courier tracking.
  - `failed`: Courier API or validation error.
  - `skipped`: Excluded from active queue by staff.
  - `cancel_requested` / `cancelled`: Dispatch stopped or cancelled with courier.
- **Courier Provider Statuses**:
  - `created`, `picked_up`, `in_transit`, `delivered`, `returned`, `cancelled`, `unknown`.

### 5. Server-Side Filtering Engine
- **Date Presets & Custom Range**:
  - Shortcuts: `Today`, `Yesterday`, `7 Days`, `30 Days`, `This Month`, `Last Month`.
  - Custom range with ISO `From` / `To` date pickers.
  - Filtered server-side on `shopify_created_at` or `shopify_updated_at`.
- **Payment Filter**: `Paid`, `Pending / COD`, `Partially Paid`, `Refunded`, `Voided`.
- **Fulfillment Filter**: `Unfulfilled`, `Fulfilled`, `Partially Fulfilled`, `On Hold`, `Cancelled`.
- **Courier Filter**: `All Couriers`, `REDX`, `Pathao`, `Steadfast`, `No Courier`.
- **Amount Range**: Min and Max amount in BDT (filtered on `total_minor` in SQL).
- **Attention Required Queue**: Aggregates orders with failed dispatches, missing customer phone numbers, or empty addresses in one place for warehouse staff.

### 6. Saved Filters (Tenant-Isolated)
- Users can name and save custom filter combinations (e.g., "Today's COD High Value", "Failed Dispatches").
- Persisted in `saved_filters` with strict Row-Level Security ensuring zero cross-tenant visibility.

### 7. Smart Multi-Select & Batch Actions
- **Smart Page-Scoped Selection**: Selecting "All" on page only checks orders eligible for the current view's action.
- **Bulk Dispatch**: Pre-dispatch validation sheet (ready vs attention counts, estimated COD total) + batch courier execution with per-order failure containment.
- **Bulk Remove**: Batch skip with optional reason.
- **Bulk Restore**: Restores selected skipped orders to active queue in a single click.
- **Bulk Cancel Dispatch**: Batch cancellation with courier API calls and detailed summary (`✓ X cancelled`, `⚠ Y unsupported`, `✕ Z failed`).

### 8. Order Details Activity Timeline & Dispatch History
- **Activity Timeline**: Full chronological trail of order creation, synchronization, skip/restore actions, courier dispatch attempts, and status changes.
- **Dispatch History**: Complete record of all attempts stored in `dispatch_attempts` with timestamps, providers, error codes, and responses.

### 9. Filter Counts & URL State Synchronization
- Server-side parallel count endpoint (`/api/orders/counts`) providing accurate real-time numbers for all tabs.
- Active tabs, search, and date filters synchronized to URL query parameters (`/orders?tab=ready&date=today`).
