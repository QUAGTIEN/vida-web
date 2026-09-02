const { GoogleAuth } = require("google-auth-library");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

const REGION = "asia-southeast1";
const FIRESTORE_READ_METRIC = "firestore.googleapis.com/document/read_count";
const DEFAULT_DAILY_READ_QUOTA = 50000;
const CACHE_DURATION_MS = 5 * 60 * 1000;
const PACIFIC_TIME_ZONE = "America/Los_Angeles";

let usageCache = null;

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  return Object.fromEntries(formatter.formatToParts(date)
    .filter(part => part.type !== "literal")
    .map(part => [part.type, Number(part.value)]));
}

function zonedMidnightToUtc(year, month, day, timeZone) {
  const desiredUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = desiredUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getZonedParts(new Date(candidate), timeZone);
    const representedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    candidate += desiredUtc - representedUtc;
  }
  return new Date(candidate);
}

function getPacificDayBounds(now = new Date()) {
  const parts = getZonedParts(now, PACIFIC_TIME_ZONE);
  return {
    start: zonedMidnightToUtc(parts.year, parts.month, parts.day, PACIFIC_TIME_ZONE),
    end: zonedMidnightToUtc(parts.year, parts.month, parts.day + 1, PACIFIC_TIME_ZONE)
  };
}

function pointValue(point) {
  const rawValue = point?.value?.int64Value ?? point?.value?.doubleValue ?? 0;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : 0;
}

async function fetchDailyReads(projectId, start, end) {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/monitoring.read"]
  });
  const client = await auth.getClient();
  const url = `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries`;
  const filter = `metric.type="${FIRESTORE_READ_METRIC}" AND resource.type="firestore_instance"`;
  let pageToken = "";
  let readsUsed = 0;

  do {
    const response = await client.request({
      url,
      method: "GET",
      params: {
        filter,
        "interval.startTime": start.toISOString(),
        "interval.endTime": end.toISOString(),
        view: "FULL",
        pageSize: 1000,
        ...(pageToken ? { pageToken } : {})
      }
    });
    const payload = response.data || {};
    (payload.timeSeries || []).forEach(series => {
      (series.points || []).forEach(point => {
        readsUsed += pointValue(point);
      });
    });
    pageToken = payload.nextPageToken || "";
  } while (pageToken);

  return Math.max(0, Math.round(readsUsed));
}

exports.getFirestoreUsage = onCall({
  region: REGION,
  cors: true,
  timeoutSeconds: 30,
  memory: "256MiB"
}, async request => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Bạn cần đăng nhập bằng tài khoản quản lý.");
  }

  const now = new Date();
  const force = request.data?.force === true;
  if (!force && usageCache && now.getTime() - usageCache.cachedAt < CACHE_DURATION_MS) {
    return usageCache.payload;
  }

  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new HttpsError("failed-precondition", "Không xác định được Google Cloud project.");
  }

  const dailyQuota = Math.max(1, Number(process.env.FIRESTORE_DAILY_READ_QUOTA) || DEFAULT_DAILY_READ_QUOTA);
  const { start, end } = getPacificDayBounds(now);

  try {
    const readsUsed = await fetchDailyReads(projectId, start, now);
    const readsRemaining = Math.max(0, dailyQuota - readsUsed);
    const percentRemaining = Math.round((readsRemaining / dailyQuota) * 1000) / 10;
    const payload = {
      readsUsed,
      readsRemaining,
      dailyQuota,
      percentRemaining,
      percentUsed: Math.round((Math.min(readsUsed, dailyQuota) / dailyQuota) * 1000) / 10,
      windowStart: start.toISOString(),
      resetAt: end.toISOString(),
      updatedAt: now.toISOString(),
      cacheSeconds: CACHE_DURATION_MS / 1000
    };
    usageCache = { cachedAt: now.getTime(), payload };
    return payload;
  } catch (error) {
    console.error("Could not read Firestore usage from Cloud Monitoring", error);
    throw new HttpsError("internal", "Không thể lấy số liệu Firestore từ Cloud Monitoring.");
  }
});
