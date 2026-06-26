---
name: Route order fix for public portal
description: Why clientPortalRouter must come before adminRouter in Express route registration
---

## The problem
`admin.ts` uses `router.use(adminAuth)` which applies the auth middleware to ALL requests routed through the admin router — including paths that don't match any admin route. If adminRouter is mounted first in the main router, ALL requests (including /client/:token) hit adminAuth and get 401.

## The fix
In `artifacts/api-server/src/routes/index.ts`, always register `clientPortalRouter` BEFORE `adminRouter`:
```ts
router.use(clientPortalRouter);  // public routes first
router.use(adminRouter);         // auth-protected routes after
```

**Why:** Express routes are matched in registration order. Public routes must be handled before the blanket auth middleware has a chance to reject them.
