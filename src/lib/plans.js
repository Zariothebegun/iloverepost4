export const PLAN_TYPES = {
  FREE: "free",
  PRO: "pro"
};

export const CONTENT_TYPES = {
  REPOSTS: "reposts"
};

export const FREE_DAILY_SEARCH_LIMIT = 3;
export const FIXED_VIDEOS_PER_CLICK = 60;

export const PLAN_DETAILS = {
  [PLAN_TYPES.FREE]: {
    id: PLAN_TYPES.FREE,
    name: "Free",
    price: 0,
    hasAds: true,
    allowedContentTypes: [CONTENT_TYPES.REPOSTS],
    dailySearchLimit: FREE_DAILY_SEARCH_LIMIT,
    maxCursor: 60,
    pageSize: 20,
    initialPageRequests: 3,
    loadMorePageRequests: 3
  },
  [PLAN_TYPES.PRO]: {
    id: PLAN_TYPES.PRO,
    name: "Pro",
    price: 4.99,
    hasAds: false,
    allowedContentTypes: [CONTENT_TYPES.REPOSTS],
    dailySearchLimit: Number.POSITIVE_INFINITY,
    // Allow much deeper pagination for Pro users (older reposts).
    maxCursor: 5000,
    pageSize: 20,
    // Pro fetches more pages per click than Free.
    initialPageRequests: 6,
    loadMorePageRequests: 6
  }
};

export function getPlanDetails(planId) {
  return PLAN_DETAILS[planId] || PLAN_DETAILS[PLAN_TYPES.FREE];
}

export function canAccessContentType(planId, contentType) {
  return getPlanDetails(planId).allowedContentTypes.includes(contentType);
}
