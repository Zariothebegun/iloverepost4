import crypto from "node:crypto";

import { PLAN_TYPES, getPlanDetails } from "./plans.js";

const sessions = new Map();

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function ensureSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      plan: PLAN_TYPES.FREE,
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
  const todayKey = getTodayKey();
  const searchesToday = session.searchesByDay[todayKey] || 0;
  const plan = getPlanDetails(session.plan);

  return {
    plan: session.plan,
    searchesToday,
    searchesRemaining:
      plan.dailySearchLimit === Number.POSITIVE_INFINITY
        ? null
        : Math.max(plan.dailySearchLimit - searchesToday, 0)
  };
}

export function recordSearch(session) {
  const todayKey = getTodayKey();
  session.searchesByDay[todayKey] = (session.searchesByDay[todayKey] || 0) + 1;
}

export function setPlan(session, plan) {
  session.plan = plan;
}

export function canSearch(session) {
  const state = getUserState(session);
  const plan = getPlanDetails(state.plan);

  if (plan.dailySearchLimit === Number.POSITIVE_INFINITY) {
    return true;
  }

  return state.searchesToday < plan.dailySearchLimit;
}
