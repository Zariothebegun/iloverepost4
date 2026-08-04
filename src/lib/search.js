import { getPlanDetails } from "./plans.js";
import { getUserState, recordSearch } from "./session-store.js";
import { searchTikTokProfile } from "./tiktok.js";

export async function executeSearch({ session, username, contentType, keyword, cursor, count }) {
  const plan = getPlanDetails(session.plan);
  const safeCursor = Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;
  const pagesToFetch = safeCursor > 0 ? plan.loadMorePageRequests || 3 : plan.initialPageRequests || 3;

  if (safeCursor > plan.maxCursor) {
    const error = new Error("Cannot search that deeply into older reposts.");
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
