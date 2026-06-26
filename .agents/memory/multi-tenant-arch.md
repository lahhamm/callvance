---
name: Multi-tenant architecture
description: How NEXUS_VOICE is structured as a multi-tenant platform with admin and client portal
---

## Auth
- Admin password: `ADMIN_PASSWORD` env var (default "nexus2024")
- Token = HMAC-SHA256(ADMIN_PASSWORD, SESSION_SECRET) — deterministic, survives restarts
- Stored in localStorage as "nexus_admin_token", sent as Authorization: Bearer header
- `POST /api/auth/login` → returns token

## DB Schema
- `clients` table: id, name, businessType, phone, isActive, accessToken (UUID no-dashes), createdAt
- All other tables (contacts, calls, bookings, availability_settings, agent_config) have `clientId` nullable column
- `calls` table has `leadScore` column ("Hot"/"Warm"/"Cold") populated by Claude at webhook time

## API Routes
- `/api/auth/login` — public
- `/api/client/:token/*` — public, look up client by accessToken
- `/api/admin/*` — requires Bearer token (adminAuth middleware in admin.ts via router.use(adminAuth))
- Legacy routes (`/api/contacts`, `/api/calls`, etc.) still present for backward compat

## Frontend Routes
- `/login` — login page, dark theme
- `/admin` — client list
- `/admin/clients/:id` — client detail (Contacts, Agent Config, Calls, Bookings, Availability, Share tabs)
- `/admin/calls` — global calls feed across all clients
- `/client/:token` — client portal, light theme, separate layout (toggles dark class off on mount)

**Why:** Designed for agency use: one admin account manages N clients, each client gets a read-only portal link.
