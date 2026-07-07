import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';

export interface AuthedUser {
  uid: string;
  email: string;
  name?: string;
}

// Firebase ID tokens are JWTs signed by Google. We verify them against Google's
// public keys — no service-account secret required, just the project id.
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

export async function verifyFirebaseToken(token: string): Promise<AuthedUser> {
  const projectId = config.firebaseProjectId;
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  const email = (payload.email as string | undefined)?.toLowerCase();
  if (!email) throw new Error('Token has no email claim');
  // Note: we don't require email_verified — sign-up is disabled and the
  // allowlist is the real gate, so admin-added email/password users are allowed.
  return { uid: String(payload.sub), email, name: payload.name as string | undefined };
}

/** Allowlist check. Deny-by-default: no config → nobody gets in. */
export function isAllowed(email: string): boolean {
  const { allowedEmails, allowedDomains } = config;
  if (allowedEmails.length === 0 && allowedDomains.length === 0) return false;
  if (allowedEmails.includes(email)) return true;
  const domain = email.split('@')[1] ?? '';
  return allowedDomains.includes(domain);
}

/** Express middleware guarding protected routes. */
export async function requireAuth(
  req: Request & { user?: AuthedUser },
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!config.firebaseProjectId) {
    res.status(500).json({ error: 'Auth not configured (FIREBASE_PROJECT_ID missing).' });
    return;
  }
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token.' });
    return;
  }
  let user: AuthedUser;
  try {
    user = await verifyFirebaseToken(token);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`[auth] token verification failed: ${reason}`);
    res.status(401).json({ error: `Token rejected: ${reason}` });
    return;
  }
  if (!isAllowed(user.email)) {
    res.status(403).json({ error: `Access denied for ${user.email}. Ask an admin to add you to the allowlist.` });
    return;
  }
  req.user = user;
  next();
}

/** Startup sanity log so a misconfigured allowlist is obvious. */
export function warnIfOpen(): void {
  if (!config.firebaseProjectId) {
    console.warn('[auth] FIREBASE_PROJECT_ID not set — protected routes will 500.');
  } else if (config.allowedEmails.length === 0 && config.allowedDomains.length === 0) {
    console.warn('[auth] No ALLOWED_EMAILS/ALLOWED_DOMAINS set — deny-by-default, nobody can use the app.');
  } else {
    console.log(
      `[auth] gate on: ${config.allowedEmails.length} email(s), ${config.allowedDomains.length} domain(s) allowed.`,
    );
  }
}
