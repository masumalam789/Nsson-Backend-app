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
