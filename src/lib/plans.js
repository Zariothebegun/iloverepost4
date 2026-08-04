export const PLAN_TYPES = {
  STANDARD: "standard"
};

export const CONTENT_TYPES = {
  REPOSTS: "reposts"
};

export const FIXED_VIDEOS_PER_CLICK = 60;

export const PLAN_DETAILS = {
  [PLAN_TYPES.STANDARD]: {
    id: PLAN_TYPES.STANDARD,
    name: "Standard",
    allowedContentTypes: [CONTENT_TYPES.REPOSTS],
    maxCursor: 5000,
    pageSize: 20,
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
