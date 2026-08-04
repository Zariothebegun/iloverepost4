import crypto from "node:crypto";

import { PLAN_TYPES, getPlanDetails } from "./plans.js";

const sessions = new Map();

function ensureSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      plan: PLAN_TYPES.STANDARD,
      searchesByDay: {}
    });
  }

  return sessions.get(sessionId);
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) return accumulator;

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

export function resolveSession(request, response) {
  const cookies = parseCookies(request.headers.cookie);
  const existingSessionId = cookies.ilr_session_id;
  const sessionId = existingSessionId || crypto.randomUUID();
  const session = ensureSession(sessionId);

  if (!existingSessionId) {
    response.setHeader("Set-Cookie", `ilr_session_id=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`);
  }

  return {
    sessionId,
    session
  };
}

export function getUserState(session) {
  return {
    plan: session.plan
  };
}

export function recordSearch(session) {
  // no-op: search tracking removed
}

export function setPlan(session, plan) {
  session.plan = plan;
}

export function canSearch() {
  return true;
}
