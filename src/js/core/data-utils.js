import {
    APP_CACHE_SCHEMA_VERSION,
    CLASS_CACHE_STALE_FALLBACK_MS,
    FIRESTORE_UI_QUERY_TIMEOUT_MS,
    FIRESTORE_UI_READ_RETRY_DELAY_MS
} from "../config/constants.js?v=20260902-loading-performance-1";
window.makeDataKey = (...parts) => JSON.stringify(parts.map(part => String(part || "").trim()));

window.withUiTimeout = (promise, timeoutMs = FIRESTORE_UI_QUERY_TIMEOUT_MS, message = "Yêu cầu tải dữ liệu quá thời gian") => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const error = new Error(message);
            error.code = "ui-timeout";
            reject(error);
        }, timeoutMs);

        Promise.resolve(promise).then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            error => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
};

window.withUiReadRetry = async (operation, options = {}) => {
    const retries = Math.max(0, Number(options.retries ?? 1));
    const delayMs = Math.max(0, Number(options.delayMs ?? FIRESTORE_UI_READ_RETRY_DELAY_MS));
    const retryableCodes = new Set([
        "ui-timeout",
        "aborted",
        "cancelled",
        "deadline-exceeded",
        "internal",
        "resource-exhausted",
        "unavailable",
        "unknown"
    ]);

    let attempt = 0;
    while (true) {
        try {
            return await operation(attempt);
        } catch (error) {
            const code = String(error?.code || "").replace(/^firestore\//, "");
            if (attempt >= retries || !retryableCodes.has(code)) throw error;
            await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
            attempt += 1;
        }
    }
};

window.measureUiRequest = async (name, operation) => {
    const safeName = String(name || "request").replace(/[^a-zA-Z0-9:_-]/g, "-");
    const token = `${safeName}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const startMark = `${token}:start`;
    const endMark = `${token}:end`;
    const canMeasure = typeof performance?.mark === "function" && typeof performance?.measure === "function";
    if (canMeasure) performance.mark(startMark);
    try {
        return await operation();
    } finally {
        if (canMeasure) {
            performance.mark(endMark);
            performance.measure(safeName, startMark, endMark);
            performance.clearMarks(startMark);
            performance.clearMarks(endMark);
        }
    }
};

window.normalizeRecordKeyPart = (value = "") => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

window.hashRecordKey = (value = "") => {
    let h1 = 0xdeadbeef ^ value.length;
    let h2 = 0x41c6ce57 ^ value.length;
    for (let i = 0; i < value.length; i++) {
        const ch = value.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

window.getSavedStudentCard = (studentName = "") => {
    return Array.from(document.querySelectorAll("#area-cards .student-card"))
        .find(card => (card.getAttribute("data-name") || "") === studentName) || null;
};

window.createLessonInstanceId = () => {
    const randomId = globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    return `lesson_${String(randomId).replace(/[^a-zA-Z0-9_-]/g, "")}`;
};

window.getOrCreateLessonInstanceId = () => {
    if (!window.currentLessonInstanceId) {
        window.currentLessonInstanceId = window.createLessonInstanceId();
    }
    return window.currentLessonInstanceId;
};

window.resetLessonInstanceId = () => {
    window.currentLessonInstanceId = "";
};

window.createRecordKeyPayload = ({ facility = "", className = "", date = "", shift = "", teacher = "", studentName = "", studentId = "", lessonInstanceId = "" } = {}) => {
    const normalizedStudentId = window.normalizeRecordKeyPart(studentId);
    const normalizedLessonInstanceId = window.normalizeRecordKeyPart(lessonInstanceId);
    const payload = {
        version: normalizedLessonInstanceId ? 3 : (normalizedStudentId ? 2 : 1),
        facility: window.normalizeRecordKeyPart(facility),
        className: window.normalizeRecordKeyPart(className),
        date: window.normalizeRecordKeyPart(date),
        shift: window.normalizeRecordKeyPart(shift),
        teacher: window.normalizeRecordKeyPart(teacher)
    };

    if (normalizedStudentId) payload.studentId = normalizedStudentId;
    else payload.studentName = window.normalizeRecordKeyPart(studentName);
    if (normalizedLessonInstanceId) payload.lessonInstanceId = normalizedLessonInstanceId;
    return payload;
};

window.createRecordKey = (payload) => JSON.stringify(window.createRecordKeyPayload(payload));

window.createRecordDocId = (payload) => `rec_${window.hashRecordKey(window.createRecordKey(payload))}`;

window.createLessonBatchId = (payload) => {
    const normalizedLessonInstanceId = window.normalizeRecordKeyPart(payload.lessonInstanceId);
    const lessonKey = JSON.stringify({
        version: normalizedLessonInstanceId ? 2 : 1,
        facility: window.normalizeRecordKeyPart(payload.facility),
        className: window.normalizeRecordKeyPart(payload.className),
        date: window.normalizeRecordKeyPart(payload.date),
        shift: window.normalizeRecordKeyPart(payload.shift),
        teacher: window.normalizeRecordKeyPart(payload.teacher),
        ...(normalizedLessonInstanceId ? { lessonInstanceId: normalizedLessonInstanceId } : {})
    });
    return `batch_${window.hashRecordKey(lessonKey)}`;
};

window.safeOptionText = (value = "") => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

window.setSelectOptions = (selectEl, defaultText, values = [], selectedValue = "") => {
    if (!selectEl) return;
    const uniqueValues = [...new Set(values.filter(Boolean))];
    const optionsHtml = uniqueValues.map(value => {
        const safe = window.safeOptionText(value);
        const selected = value === selectedValue ? " selected" : "";
        return `<option value="${safe}"${selected}>${safe}</option>`;
    }).join("");
    selectEl.innerHTML = `<option value="">${defaultText}</option>${optionsHtml}`;
    selectEl.disabled = false;
};

window.getJsonCache = (key, durationMs) => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        if (!cache || cache.cacheVersion !== APP_CACHE_SCHEMA_VERSION) return null;
        if (Date.now() - Number(cache.savedAt || 0) > durationMs) return null;
        return cache;
    } catch (error) {
        localStorage.removeItem(key);
        return null;
    }
};

window.getStaleJsonCache = (key, maxAgeMs = CLASS_CACHE_STALE_FALLBACK_MS) => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        if (!cache || cache.cacheVersion !== APP_CACHE_SCHEMA_VERSION) return null;
        if (Date.now() - Number(cache.savedAt || 0) > maxAgeMs) return null;
        return cache;
    } catch (error) {
        return null;
    }
};

window.saveJsonCache = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify({
            cacheVersion: APP_CACHE_SCHEMA_VERSION,
            savedAt: Date.now(),
            ...data
        }));
    } catch (error) {
        localStorage.removeItem(key);
    }
};

window.getRecordTimestampMs = (record = {}) => {
    const cachedMs = Number(record.timestampMs || 0);
    if (Number.isFinite(cachedMs) && cachedMs > 0) return cachedMs;

    const timestamp = record.timestamp;
    if (timestamp && typeof timestamp.toDate === "function") return timestamp.toDate().getTime();
    if (timestamp && Number.isFinite(Number(timestamp.seconds))) return Number(timestamp.seconds) * 1000;
    if (timestamp instanceof Date) return timestamp.getTime();

    const parsedDate = window.parseDateVn?.(record.date) || 0;
    return Number.isFinite(Number(parsedDate)) ? Number(parsedDate) : 0;
};
