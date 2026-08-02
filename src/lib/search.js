import { canAccessContentType, getPlanDetails } from "./plans.js";
import { canSearch, getUserState, recordSearch } from "./session-store.js";
import { searchTikTokProfile } from "./tiktok.js";

export async function executeSearch({ session, username, contentType, keyword, cursor, count }) {
  if (!canAccessContentType(session.plan, contentType)) {
    const plan = getPlanDetails(session.plan);
    const error = new Error(`${plan.name} users can only search reposts.`);
    error.statusCode = 403;
    error.code = "plan_restriction";
    throw error;
  }

  if (!canSearch(session)) {
    const error = new Error("Daily limit reached. Free users can perform up to 3 searches per day.");
    error.statusCode = 429;
    error.code = "daily_limit_reached";
    throw error;
  }

  const plan = getPlanDetails(session.plan);
  const safeCursor = Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;
  const pagesToFetch = safeCursor > 0 ? plan.loadMorePageRequests || 3 : plan.initialPageRequests || 3;

  if (safeCursor > plan.maxCursor) {
    const error = new Error("Your current plan cannot search that deeply into older reposts.");
    error.statusCode = 403;
    error.code = "depth_limit_reached";
    throw error;
  }

  const safeCount = Math.min(Math.max(Number(count) || plan.pageSize, 1), plan.pageSize);

  const result = await searchTikTokProfile({
    username,
    contentType,
    keyword,
    cursor: safeCursor,
    count: safeCount,
    pagesToFetch,
    maxSearchCursor: plan.maxCursor
  });

  const fetchedCount = result?.debug?.fetchedVideoCount ?? 0;
  const nextCursor = result?.pagination?.cursor ?? String(safeCursor);
  console.log(
    `[ILOVEREPOST] Fetched ${fetchedCount} videos from TikTok (cursor ${nextCursor}) ` +
      `[pages=${result?.debug?.pagesFetched ?? 0}/${pagesToFetch}] username=${username.replace(/^@+/, "")}`
  );

  recordSearch(session);

  return {
    ...result,
    account: getUserState(session)
  };
}

export function normalizeSearchError(error, session) {
  return {
    statusCode: error.statusCode || 502,
    payload: {
      error: error.message,
      code: error.code || "search_failed",
      account: getUserState(session)
    }
  };
}
