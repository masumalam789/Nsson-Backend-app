# NSSON Backend API

Node.js / Express / MongoDB backend for the NSSON e-commerce platform.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Environment Variables](#environment-variables)
4. [Running the Server](#running-the-server)
5. [MongoDB Migration — Address Field](#mongodb-migration--address-field)
6. [API Reference — Auth & User Endpoints](#api-reference--auth--user-endpoints)
   - [POST /api/auth/register](#post-apiauthregister)
   - [POST /api/auth/login](#post-apiauthlogin)
   - [GET /api/auth/me](#get-apiauthme)
   - [PUT /api/auth/me](#put-apiauthme)
   - [POST /api/auth/change-password](#post-apiauthchange-password)
   - [POST /api/auth/logout](#post-apiauthlogout)
   - [POST /api/auth/forgot-password](#post-apiauthforgot-password)
   - [POST /api/auth/reset-password/:token](#post-apiauthreset-passwordtoken)
   - [GET /api/auth/verify-reset-token/:token](#get-apiauthverify-reset-tokentoken)
   - [GET /api/users](#get-apiusers)
   - [GET /api/users/:id](#get-apiusersid)
   - [PUT /api/users/:id](#put-apiusersid)
   - [DELETE /api/users/:id](#delete-apiusersid)
   - [GET /api/auth/users/pending](#get-apiauthuserspending)
   - [PATCH /api/auth/:id/approve](#patch-apiauthidapprove)
   - [PATCH /api/auth/:id/reject](#patch-apiauthidreject)

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **MongoDB** (local or Atlas)

---

## Installation

```bash
# Clone the repo
git clone <repo-url>
cd Nsson-Backend-app

# Install dependencies
npm install
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=8080
MONGO_URI=mongodb://localhost:27017/nsson
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d
ADMIN_SECRET=your_admin_secret_here

# Email (Nodemailer / SMTP)
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your@email.com
EMAIL_PASS=yourpassword
EMAIL_FROM=noreply@nsson.com
```

---

## Running the Server

```bash
# Development (with auto-restart via nodemon)
npm run dev

# Production
npm start
```

Server starts on `http://localhost:8080` by default.

---

## MongoDB Migration — Address Field

The `address` field was added to the `User` model schema. Because MongoDB is **schema-less**, existing user documents **do not** automatically get this field — they will simply have `address` as `undefined`.

### What the migration does

- Adds `address: ""` (empty string) to all existing user documents that don't already have it.
- This makes the field consistent across all documents and prevents `undefined` vs `""` comparison issues.

### Run the migration

**Option 1 — Using mongosh (recommended)**


Expected output:
```
{ acknowledged: true, matchedCount: <N>, modifiedCount: <N> }
```

**Option 2 — Using a migration script**

```

**Option 3 — MongoDB Atlas UI**

1. Open your cluster → Collections → `users`
2. Click **"Aggregation"** tab → Switch to **"Update"** view
3. Filter: `{ "address": { "$exists": false } }`
4. Update: `{ "$set": { "address": "" } }`
5. Click **"Update Documents"**

> **Note:** No server restart is needed after the migration. The schema change is in code only and takes effect immediately on next server start.

---

## API Reference — Auth & User Endpoints

### Base URL

```
http://localhost:8080/api
```

### Authentication

Protected routes require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

---

### POST /api/auth/register

Register a new customer account. The account starts as **pending** until an admin approves it.

**Request Body**

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "secret123",
  "confirmPassword": "secret123",
  "phone": "9876543210",
  "address": "123 Main St, Mumbai, Maharashtra",
  "shopDetails": {
    "shopName": "John's Auto Parts",
    "gstNumber": "22ABCDE1234F1Z5",
    "businessAddress": "Shop 4, Market Complex, Mumbai"
  }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `firstName` | ✅ | Min 2, max 50 chars |
| `lastName` | ✅ | Min 2, max 50 chars |
| `email` | ✅ | Must be unique |
| `password` | ✅ | Min 8 chars |
| `confirmPassword` | ✅ | Must match password |
| `phone` | ❌ | Exactly 10 digits |
| `address` | ✅ | Customer's delivery address |
| `shopDetails.shopName` | ✅ | Required for customers |
| `shopDetails.gstNumber` | ❌ | |
| `shopDetails.businessAddress` | ✅ | Required for customers |

**Response `201`**

```json
{
  "message": "Account created successfully. Please wait for admin approval before logging in.",
  "user": { "...": "user object without password" }
}
```

---

### POST /api/auth/login

Unified login for both customers and admins.

**Request Body**

```json
{
  "identifier": "john@example.com",
  "password": "secret123"
}
```

> `identifier` can be email **or** phone number. Alternatively, you may send `email` instead of `identifier`.

**Response `200`**

```json
{
  "message": "Login successful",
  "token": "<jwt>",
  "user": { "...": "user object" },
  "loginType": "user",
  "role": "customer"
}
```

**Error cases**

| Status | Reason |
|--------|--------|
| `400` | Missing identifier or password |
| `401` | Invalid credentials |
| `403` | Account pending or rejected |

---

### GET /api/auth/me

Get the currently authenticated user's profile.

**Headers:** `Authorization: Bearer <token>`

**Response `200`**

```json
{
  "message": "Profile retrieved successfully",
  "user": {
    "_id": "...",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "9876543210",
    "address": "123 Main St, Mumbai",
    "role": "customer",
    "status": "approved",
    "shopDetails": {
      "shopName": "John's Auto Parts",
      "gstNumber": "22ABCDE1234F1Z5",
      "businessAddress": "Shop 4, Market Complex, Mumbai"
    }
  },
  "role": "customer"
}
```

> For **admin** users, a `stats` object is also included in the response.

---

### PUT /api/auth/me

Update the currently authenticated user's profile. All fields are **optional** — only the fields you send will be updated.

**Headers:** `Authorization: Bearer <token>`

**Request Body** (all optional)

```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@example.com",
  "phone": "9123456789",
  "address": "456 New Street, Delhi",
  "shopDetails": {
    "shopName": "Jane's Garage",
    "gstNumber": "27XYZAB5678C2D6",
    "businessAddress": "Plot 10, Industrial Area, Delhi"
  }
}
```

| Field | Notes |
|-------|-------|
| `email` | Validated for format + checked for duplicates across users |
| `phone` | Exactly 10 digits |
| `address` | Plain string |
| `shopDetails.shopName` | Updates only this sub-field |
| `shopDetails.gstNumber` | Updates only this sub-field |
| `shopDetails.businessAddress` | Updates only this sub-field |

**Response `200`**

```json
{
  "message": "Profile updated successfully",
  "user": { "...": "updated user object" }
}
```

**Error cases**

| Status | Reason |
|--------|--------|
| `400` | Invalid phone / email format, or no valid fields sent |
| `409` | Email already in use by another account |

---

### POST /api/auth/change-password

**Headers:** `Authorization: Bearer <token>`

**Request Body**

```json
{
  "currentPassword": "oldpass123",
  "newPassword": "newpass456",
  "confirmPassword": "newpass456"
}
```

**Response `200`**

```json
{ "message": "Password changed successfully", "user": { "...": "basic user info" } }
```

---

### POST /api/auth/logout

**Headers:** `Authorization: Bearer <token>`

**Response `200`**

```json
{ "success": true, "message": "Logged out successfully", "timestamp": "..." }
```

---

### POST /api/auth/forgot-password

**Request Body**

```json
{ "email": "john@example.com" }
```

**Response `200`** (always, even if email not found — prevents enumeration)

```json
{
  "message": "If an account with that email exists, a password reset link has been sent.",
  "note": "Please check your inbox and spam folder. The link expires in 1 hour."
}
```

---

### POST /api/auth/reset-password/:token

**Request Body**

```json
{
  "password": "newpassword123",
  "confirmPassword": "newpassword123"
}
```

**Response `200`**

```json
{ "message": "Password reset successfully. You can now log in with your new password.", "user": { "...": "basic user info" } }
```

---

### GET /api/auth/verify-reset-token/:token

Validates whether a password-reset token is still valid.

**Response `200`**

```json
{ "valid": true, "message": "Token is valid", "email": "john@example.com" }
```

---

### GET /api/users

> 🔒 **Admin only**

List all users with optional filtering and pagination.

**Query Params**

| Param | Default | Notes |
|-------|---------|-------|
| `status` | — | `pending` / `approved` / `rejected` |
| `role` | — | `customer` / `admin` |
| `page` | `1` | |
| `limit` | `20` | |

**Response `200`**

```json
{
  "message": "Users fetched successfully",
  "total": 42,
  "page": 1,
  "pages": 3,
  "users": [ "..." ]
}
```

---

### GET /api/users/:id

> 🔒 **Admin only**

Get a single user by MongoDB ObjectId.

**Response `200`**

```json
{ "message": "User fetched successfully", "user": { "..." : "user object" } }
```

---

### PUT /api/users/:id

> 🔒 **Admin only**

Update any user. All fields optional.

**Request Body**

```json
{
  "firstName": "Updated",
  "lastName": "Name",
  "email": "updated@example.com",
  "phone": "9000000000",
  "address": "New address string",
  "shopDetails": {
    "shopName": "New Shop Name",
    "gstNumber": "00NEWGST0000A1Z2",
    "businessAddress": "New Business Address"
  },
  "role": "customer",
  "status": "approved"
}
```

> Use `approvalStatus` as an alias for `status` if preferred.

**Response `200`**

```json
{ "message": "User updated successfully", "user": { "..." : "updated user" } }
```

---

### DELETE /api/users/:id

> 🔒 **Admin only**

Permanently delete a user document.

**Response `200`**

```json
{ "message": "User deleted successfully" }
```

---

### GET /api/auth/users/pending

> 🔒 **Admin only**

Returns all customer accounts awaiting approval.

**Response `200`**

```json
{
  "message": "Pending users fetched successfully",
  "count": 5,
  "users": [ "..." ]
}
```

---

### PATCH /api/auth/:id/approve

> 🔒 **Admin only**

Approve a pending customer. Sends approval email + push notification.

**Response `200`**

```json
{ "message": "John Doe's account has been approved. They can now log in.", "user": { "..." : "..." } }
```

---

### PATCH /api/auth/:id/reject

> 🔒 **Admin only**

Reject a pending customer. Sends rejection email + push notification.

**Response `200`**

```json
{ "message": "John Doe's account has been rejected.", "user": { "..." : "..." } }
```

---

## Common Error Responses

| Status | Description |
|--------|-------------|
| `400` | Bad request / validation error |
| `401` | Missing or invalid token |
| `403` | Forbidden (wrong role or account not approved) |
| `404` | Resource not found |
| `409` | Conflict (e.g. duplicate email) |
| `500` | Internal server error |
