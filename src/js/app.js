import "./core/data-utils.js?v=20260902-loading-performance-1";
import "./core/format.js";
import "./ui/feedback.js";
import "./features/system-management.js?v=20260902-teacher-periods-1";
import "./ui/app-interactions.js?v=20260901-management-navigation-2";
import { ensureExcelAssets } from "./core/lazy-assets.js";
import {
    ensureDashboardFeature,
    ensureDataCenterFeature,
    ensureExportFeature,
    ensureSystemListFeature
} from "./core/lazy-features.js";
import { collection, addDoc, getDocs, query, where, orderBy, limit, startAfter, getCountFromServer, runTransaction, serverTimestamp, writeBatch, doc, setDoc, deleteDoc, getDoc, updateDoc, increment, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, updateEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { auth, db } from "./config/firebase.js?v=20260826-data-center-2";
import {
    A2_FILTER_STUDENTS_CACHE_DURATION_MS,
    A2_FILTER_STUDENTS_CACHE_KEY,
    A2_RECORDS_CACHE_DURATION_MS,
    A2_RECORDS_CACHE_KEY,
    APP_CACHE_SCHEMA_VERSION,
    APP_STATIC_DATA_CACHE_DURATION_MS,
    APP_STATIC_DATA_CACHE_KEY,
    APP_DOM_CACHE_DURATION_MS,
    APP_DOM_CACHE_KEY,
    APP_STATE_DURATION_MS,
    APP_STATE_KEY,
    CLASS_CACHE_STALE_FALLBACK_MS,
    CLASS_OPTIONS_CACHE_DURATION_MS,
    CLASS_OPTIONS_CACHE_KEY,
    CLASS_STUDENTS_CACHE_DURATION_MS,
    CLASS_STUDENTS_CACHE_KEY,
    DASHBOARD_RECORDS_CACHE_DURATION_MS,
    DASHBOARD_RECORDS_CACHE_KEY,
    DASHBOARD_RECORDS_LIMIT,
    DASHBOARD_SUMMARY_BATCH_COLLECTION,
    DASHBOARD_SUMMARY_CACHE_DURATION_MS,
    DASHBOARD_SUMMARY_CACHE_KEY,
    DASHBOARD_SUMMARY_META_COLLECTION,
    DASHBOARD_SUMMARY_META_DOC,
    DASHBOARD_SUMMARY_RECONCILE_MS,
    FIRESTORE_UI_QUERY_TIMEOUT_MS,
    GLOBAL_SEARCH_CACHE_DURATION_MS,
    GLOBAL_SEARCH_CACHE_KEY,
    GLOBAL_SEARCH_META_COLLECTION,
    GLOBAL_SEARCH_META_DOC,
    GLOBAL_SEARCH_VERSION_CHECK_INTERVAL_MS,
    STUDENT_SEARCH_DEBOUNCE_MS,
    STUDENT_SEARCH_INDEX_META_DOC,
    STUDENT_SEARCH_INDEX_STATUS_CACHE_KEY,
    STUDENT_SEARCH_INDEX_STATUS_CACHE_MS,
    STUDENT_SEARCH_INDEX_VERSION,
    STUDENT_SEARCH_MIN_LENGTH,
    STUDENT_SEARCH_QUERY_LIMIT,
    STUDENT_SEARCH_RESULTS_CACHE_MS,
    TEACHER_DOM_CACHE_TABS,
    TEACHER_SESSION_DURATION_MS,
    TEACHER_SESSION_KEY,
    TEACHER_WORKING_DRAFT_DURATION_MS,
    TEACHER_WORKING_DRAFT_KEY,
    TEACHER_WORKING_DRAFT_VERSION
} from "./config/constants.js?v=20260902-loading-performance-1";

const installLazyFeatureEntry = (functionName, ensureFeature) => {
    const lazyEntry = async (...args) => {
        await ensureFeature();
        const loadedFunction = window[functionName];
        if (typeof loadedFunction !== "function" || loadedFunction === lazyEntry) {
            throw new Error(`Chức năng ${functionName} chưa sẵn sàng.`);
        }
        return loadedFunction(...args);
    };
    window[functionName] = lazyEntry;
};

installLazyFeatureEntry("loadDashboardData", ensureDashboardFeature);
installLazyFeatureEntry("openDataCenter", ensureDataCenterFeature);
installLazyFeatureEntry("openSystemListPage", ensureSystemListFeature);
installLazyFeatureEntry("openExportModal", ensureExportFeature);
[
    "switchDataCenterView",
    "renderDataHistory",
    "changeDataHistoryRange",
    "loadDataHistory",
    "scanDataCleanup",
    "renderCleanupInventory",
    "toggleAllCleanupStudents",
    "startSelectedDataCleanup"
].forEach(name => installLazyFeatureEntry(name, ensureDataCenterFeature));

let isProcessingAction = false;
let touchHandled = false;
let isRestoringAppState = false;
let fastDomCacheRestored = false;
let fastDomCacheRestoredTab = "";
let appStateSaveTimer = null;
let resumeRecoveryPromise = null;
let appStaticDataReady = false;
let finalSaveUnlockTimer = null;
let globalSearchFetchPromise = null;
let globalSearchVersionCheckPromise = null;
let globalSearchVersionBumpPromise = null;
let studentSearchIndexStatusPromise = null;
let studentSearchMigrationPromise = null;
let studentSearchDebounceTimer = null;
let studentSearchRequestId = 0;
const studentSearchResultCache = new Map();
const studentSearchFetchPromises = new Map();
let dashboardSummaryFetchPromise = null;
let dashboardRecordsRealtimePromise = null;
let dashboardRecordsRealtimeUnsubscribe = null;
let dashboardRealtimeLatestRecords = null;

window.masterDataHS = [];
window.classStudents = [];
window.addedStudents = new Set();
window.tempCache = {};
window.listA2 = [];
window.allCategories = [];
window.allStudentsGlobalList = [];
window.allFacilities = [];
window.facilityCategoriesMap = {};
window.currentPreviewCanvas = null;
window.currentPreviewCanvases = [];
window.currentPreviewPdfBlob = null;
window.currentPreviewMode = "image";
window.currentEvaluationZoom = 100;
window.currentA2SelectedStudent = null;
window.allTeachers = [];
window.currentCommentPrefix = "";
window.currentLessonInstanceId = "";
window.dashboardRecordsPageLimit = DASHBOARD_RECORDS_LIMIT;
window.globalSchools = [];
window.currentSystemStudents = [];
window.studentSchoolMap = {};
window.classesByFacilityCategory = {};
window.studentsByFacilityClass = {};
window.categoryPrefixByFacilityCategory = {};
/** Map tên HS → document id Firestore (collection students) — dùng khi lưu ghi chú */
window.studentDocIdByName = {};
/** Map tên HS → ghiChu đã lưu trên Firebase */
window.studentGhiChuByName = {};
window.uiAsyncState = {
    isLoadingClasses: false,
    isLoadingStudents: false,
    classesStatus: "idle",
    studentsStatus: "idle",
    isSubmittingFinal: false,
    finalSaveStartedAt: 0,
    facilityRequestId: 0,
    classRequestId: 0,
    reviewFacilityRequestId: 0,
    reviewClassRequestId: 0,
    reviewFilterRequestId: 0,
    a2RecordRequestId: 0,
    scheduleRequestId: 0,
    studentsRequestId: 0,
    isGlobalSearchReady: false,
    classOptionsFetches: {},
    facilityCategoryFetches: {},
    reviewClassOptionsFetches: {},
    classStudentsFetches: {},
    filterStudentsFetches: {},
    a2RecordFetches: {}
};

window.setSelectLoadingState = (selectEl, isLoading, loadingText, defaultText) => {
    if (!selectEl) return;
    selectEl.disabled = !!isLoading;
    if (isLoading) {
        selectEl.innerHTML = `<option value="">${loadingText}</option>`;
        return;
    }
    if (defaultText) {
        selectEl.innerHTML = `<option value="">${defaultText}</option>`;
    }
};

window.waitForInitialData = async () => {
    if (!window.initPromise || typeof window.initPromise.then !== "function") return;
    try {
        await window.initPromise;
    } catch (error) {
        console.error("[waitForInitialData] init failed:", error);
    }
};

window.getCurrentTeacherFacility = () => document.getElementById("select-facility-gv")?.value || "";

window.SHIFT_OPTIONS = ["Sáng ca 1", "Sáng ca 2", "Chiều ca 1", "Chiều ca 2", "Chiều ca 3", "Tối ca 1", "Tối ca 2"];

window.populateShiftSelect = (selectedValue = "") => {
    const select = document.getElementById("select-schedule-gv");
    if (!select) return;
    const current = selectedValue || select.value || "";
    select.innerHTML = '<option value="">-- Chọn ca học --</option>';
    window.SHIFT_OPTIONS.forEach(shift => {
        select.innerHTML += `<option value="${shift}" ${shift === current ? "selected" : ""}>${shift}</option>`;
    });
    select.disabled = false;
};

window.getFacilityCode = (value = "") => {
    const text = String(value || "").trim();
    const csMatch = text.match(/CS\s*\d+/i);
    if (csMatch) return csMatch[0].replace(/\s+/g, "").toUpperCase();
    const digitMatch = text.match(/\d+/);
    return digitMatch ? `CS${digitMatch[0]}` : (text || "CS1");
};

window.getClassStudentsQuery = (lop, facilityName = window.getCurrentTeacherFacility()) => {
    const filters = [where("className", "==", lop)];
    if (facilityName) filters.push(where("facility", "==", facilityName));
    return query(collection(db, "students"), ...filters);
};

window.normalizeDashboardRecord = (record = {}) => {
    const normalized = { ...record, timestampMs: window.getRecordTimestampMs(record) };
    delete normalized.timestamp;
    return normalized;
};

window.getCachedDashboardRecords = (options = {}) => {
    try {
        const raw = localStorage.getItem(DASHBOARD_RECORDS_CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        if (!cache || cache.cacheVersion !== APP_CACHE_SCHEMA_VERSION || !Array.isArray(cache.records)) return null;
        const isExpired = Date.now() - Number(cache.savedAt || 0) > DASHBOARD_RECORDS_CACHE_DURATION_MS;
        if (isExpired && options.allowExpired !== true) return null;
        return cache.records.slice();
    } catch (error) {
        localStorage.removeItem(DASHBOARD_RECORDS_CACHE_KEY);
        return null;
    }
};

window.saveDashboardRecordsCache = (records = []) => {
    window.saveJsonCache(DASHBOARD_RECORDS_CACHE_KEY, {
        records: records.map(record => window.normalizeDashboardRecord(record))
    });
};

window.invalidateDashboardRecordsCache = () => {
    localStorage.removeItem(DASHBOARD_RECORDS_CACHE_KEY);
};

window.startDashboardRecordsRealtime = (options = {}) => {
    if (dashboardRecordsRealtimePromise) return dashboardRecordsRealtimePromise;

    const notifyFirstSnapshot = options.notifyFirstSnapshot === true;
    const recordsQuery = query(
        collection(db, "records"),
        orderBy("timestamp", "desc"),
        limit(DASHBOARD_RECORDS_LIMIT)
    );

    dashboardRecordsRealtimePromise = new Promise((resolve, reject) => {
        let isFirstSnapshot = true;
        dashboardRecordsRealtimeUnsubscribe = onSnapshot(recordsQuery, snapshot => {
            const records = snapshot.docs.map(item => window.normalizeDashboardRecord({
                id: item.id,
                ...item.data()
            }));
            dashboardRealtimeLatestRecords = records;
            window.saveDashboardRecordsCache(records);

            if (isFirstSnapshot) {
                isFirstSnapshot = false;
                resolve(records);
                if (notifyFirstSnapshot) window.handleDashboardRecordsRealtimeUpdate?.(records);
                return;
            }

            window.handleDashboardRecordsRealtimeUpdate?.(records);
        }, error => {
            console.error('[dashboard realtime] listener failed:', error);
            if (isFirstSnapshot) reject(error);
            dashboardRecordsRealtimePromise = null;
            dashboardRecordsRealtimeUnsubscribe = null;
        });
    });

    return dashboardRecordsRealtimePromise;
};

window.stopDashboardRecordsRealtime = () => {
    dashboardRecordsRealtimeUnsubscribe?.();
    dashboardRecordsRealtimeUnsubscribe = null;
    dashboardRecordsRealtimePromise = null;
    dashboardRealtimeLatestRecords = null;
};

window.fetchDashboardRecords = async (options = {}) => {
    const cached = options.forceRefresh === true ? null : window.getCachedDashboardRecords();
    const realtimePromise = window.startDashboardRecordsRealtime({
        notifyFirstSnapshot: Array.isArray(cached)
    });

    if (cached && options.forceRefresh !== true) return cached;
    if (dashboardRealtimeLatestRecords) return dashboardRealtimeLatestRecords.slice();

    try {
        return await realtimePromise;
    } catch (error) {
        const staleRecords = window.getCachedDashboardRecords({ allowExpired: true });
        if (staleRecords) return staleRecords;
        throw error;
    }
};

window.fetchDashboardHistoryRecordsPage = async (oldestTimestampMs = 0, options = {}) => {
    const timestampMs = Number(oldestTimestampMs || 0);
    const rangeStartMs = Number(options.rangeStartMs || 0);
    const rangeEndMs = Number(options.rangeEndMs || 0);
    const constraints = [];

    if (rangeStartMs > 0) constraints.push(where("timestamp", ">=", new Date(rangeStartMs)));
    if (rangeEndMs > 0) constraints.push(where("timestamp", "<", new Date(rangeEndMs)));
    constraints.push(orderBy("timestamp", "desc"));
    if (timestampMs > 0) constraints.push(startAfter(new Date(timestampMs)));
    constraints.push(limit(DASHBOARD_RECORDS_LIMIT));

    const historyQuery = query(collection(db, "records"), ...constraints);
    const snapshot = await getDocs(historyQuery);
    return snapshot.docs.map(item => window.normalizeDashboardRecord({
        id: item.id,
        ...item.data()
    }));
};

window.getDashboardDateEntries = () => {
    const entries = [];
    for (let offset = 6; offset >= 0; offset--) {
        const date = new Date();
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() - offset);
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        entries.push({
            key: `${year}-${month}-${day}`,
            displayDate: `${day}/${month}/${year}`,
            label: `${day}/${month}`
        });
    }
    return entries;
};

window.getDashboardSummaryCountField = (dateKey, facilityName) => {
    const safeDate = String(dateKey || "").replace(/[^0-9]/g, "_");
    const safeFacility = window.getFacilityCode(facilityName).replace(/[^A-Z0-9]/g, "_");
    return `count_${safeDate}_${safeFacility}`;
};

window.getDashboardTimestampMs = (value) => {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value && Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000;
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric : 0;
};

window.normalizeDashboardSummary = (data = {}) => {
    const counts = {};
    window.getDashboardDateEntries().forEach(entry => {
        counts[entry.key] = {};
        window.allFacilities.forEach(facility => {
            const field = window.getDashboardSummaryCountField(entry.key, facility);
            counts[entry.key][window.getFacilityCode(facility)] = Number(data[field] || 0);
        });
    });
    return {
        counts,
        reconciledAtMs: window.getDashboardTimestampMs(data.reconciledAt)
    };
};

window.getCachedDashboardSummary = (options = {}) => {
    try {
        const raw = localStorage.getItem(DASHBOARD_SUMMARY_CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        if (!cache || cache.cacheVersion !== APP_CACHE_SCHEMA_VERSION || !cache.summary) return null;
        const isExpired = Date.now() - Number(cache.savedAt || 0) > DASHBOARD_SUMMARY_CACHE_DURATION_MS;
        if (isExpired && options.allowExpired !== true) return null;
        return cache.summary;
    } catch (error) {
        localStorage.removeItem(DASHBOARD_SUMMARY_CACHE_KEY);
        return null;
    }
};

window.saveDashboardSummaryCache = (summary) => {
    window.saveJsonCache(DASHBOARD_SUMMARY_CACHE_KEY, { summary });
};

window.invalidateDashboardSummaryCache = () => {
    localStorage.removeItem(DASHBOARD_SUMMARY_CACHE_KEY);
    dashboardSummaryFetchPromise = null;
};

window.markDashboardSummaryForReconcile = () => {
    window.invalidateDashboardSummaryCache();
    return setDoc(doc(db, DASHBOARD_SUMMARY_META_COLLECTION, DASHBOARD_SUMMARY_META_DOC), {
        reconciledAt: 0,
        updatedAt: serverTimestamp()
    }, { merge: true }).catch(error => {
        console.error("Dashboard summary invalidation failed:", error);
    });
};

window.reconcileDashboardSummary = async () => {
    await window.waitForInitialData();
    if (!Array.isArray(window.allFacilities) || window.allFacilities.length === 0) return null;

    const dateEntries = window.getDashboardDateEntries();
    const requests = [];
    dateEntries.forEach(entry => {
        window.allFacilities.forEach(facility => {
            requests.push({
                entry,
                facility,
                promise: getCountFromServer(query(
                    collection(db, "records"),
                    where("date", "==", entry.displayDate),
                    where("facility", "==", facility)
                ))
            });
        });
    });

    const snapshots = await Promise.all(requests.map(item => item.promise));
    const summaryFields = {};
    requests.forEach((item, index) => {
        const field = window.getDashboardSummaryCountField(item.entry.key, item.facility);
        summaryFields[field] = Number(snapshots[index].data().count || 0);
    });

    await setDoc(doc(db, DASHBOARD_SUMMARY_META_COLLECTION, DASHBOARD_SUMMARY_META_DOC), {
        ...summaryFields,
        reconciledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });

    const summary = window.normalizeDashboardSummary({
        ...summaryFields,
        reconciledAt: Date.now()
    });
    window.saveDashboardSummaryCache(summary);
    return summary;
};

window.fetchDashboardSummary = async (options = {}) => {
    await window.waitForInitialData();
    if (!Array.isArray(window.allFacilities) || window.allFacilities.length === 0) return null;
    if (!options.forceRefresh) {
        const cached = window.getCachedDashboardSummary();
        if (cached) return cached;
    }

    if (dashboardSummaryFetchPromise) return dashboardSummaryFetchPromise;
    dashboardSummaryFetchPromise = (async () => {
        const staleSummary = window.getCachedDashboardSummary({ allowExpired: true });
        try {
            const snapshot = await getDoc(doc(db, DASHBOARD_SUMMARY_META_COLLECTION, DASHBOARD_SUMMARY_META_DOC));
            if (snapshot.exists()) {
                const summary = window.normalizeDashboardSummary(snapshot.data());
                const isReconciled = summary.reconciledAtMs > 0
                    && Date.now() - summary.reconciledAtMs < DASHBOARD_SUMMARY_RECONCILE_MS;
                if (isReconciled) {
                    window.saveDashboardSummaryCache(summary);
                    return summary;
                }
            }
            return await window.reconcileDashboardSummary();
        } catch (error) {
            console.error("Dashboard summary load failed:", error);
            if (staleSummary) return staleSummary;
            return null;
        }
    })().finally(() => {
        dashboardSummaryFetchPromise = null;
    });
    return dashboardSummaryFetchPromise;
};

window.updateDashboardSummaryForBatch = async ({ batchId, dateKey, facility, recordCount }) => {
    if (!batchId || !dateKey || !facility) return;
    const normalizedCount = Math.max(0, Number(recordCount || 0));
    const summaryRef = doc(db, DASHBOARD_SUMMARY_META_COLLECTION, DASHBOARD_SUMMARY_META_DOC);
    const markerRef = doc(db, DASHBOARD_SUMMARY_BATCH_COLLECTION, batchId);
    const countField = window.getDashboardSummaryCountField(dateKey, facility);

    await runTransaction(db, async transaction => {
        const markerSnapshot = await transaction.get(markerRef);
        const previousCount = markerSnapshot.exists() ? Number(markerSnapshot.data()?.recordCount || 0) : 0;
        const delta = normalizedCount - previousCount;

        transaction.set(markerRef, {
            batchId,
            dateKey,
            facility: window.getFacilityCode(facility),
            recordCount: normalizedCount,
            updatedAt: serverTimestamp()
        }, { merge: true });

        if (delta !== 0) {
            transaction.set(summaryRef, {
                [countField]: increment(delta),
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
    });

    window.invalidateDashboardSummaryCache();
};

window.updateGlobalSearchDatalist = () => {
    const dlSchools = document.getElementById('dl-schools');
    if (!dlSchools) return;
    const uniqueSchools = new Set();
    window.allStudentsGlobalList.forEach(hs => {
        if (hs.school) uniqueSchools.add(hs.school);
    });
    dlSchools.innerHTML = '';
    uniqueSchools.forEach(s => {
        dlSchools.innerHTML += `<option value="${window.safeOptionText(s)}">`;
    });
};

window.rebuildGlobalSearchIndexes = () => {
    window.studentsByFacilityClass = {};
    window.allStudentsGlobalList.forEach(hs => {
        const key = window.makeDataKey(hs.facility, hs.className);
        if (!window.studentsByFacilityClass[key]) window.studentsByFacilityClass[key] = [];
        window.studentsByFacilityClass[key].push(hs);
    });
};

window.applyGlobalSearchPayload = (payload = {}) => {
    if (payload.classCategoryMap && typeof payload.classCategoryMap === "object") {
        window.classCategoryMap = { ...payload.classCategoryMap };
    }
    if (payload.categoryColorMap && typeof payload.categoryColorMap === "object") {
        window.categoryColorMap = { ...payload.categoryColorMap };
    }
    if (payload.classesByFacilityCategory && typeof payload.classesByFacilityCategory === "object") {
        window.classesByFacilityCategory = { ...payload.classesByFacilityCategory };
    }
    if (payload.categoryPrefixByFacilityCategory && typeof payload.categoryPrefixByFacilityCategory === "object") {
        window.categoryPrefixByFacilityCategory = { ...payload.categoryPrefixByFacilityCategory };
    }
    if (payload.facilityCategoriesMap && typeof payload.facilityCategoriesMap === "object" && Object.keys(window.facilityCategoriesMap || {}).length === 0) {
        window.facilityCategoriesMap = { ...payload.facilityCategoriesMap };
    }
    if (Array.isArray(payload.allStudentsGlobalList)) {
        window.allStudentsGlobalList = payload.allStudentsGlobalList.slice();
    }
    window.rebuildGlobalSearchIndexes();
    window.updateGlobalSearchDatalist();
    window.uiAsyncState.isGlobalSearchReady = window.allStudentsGlobalList.length > 0;
};

window.getGlobalSearchCacheEnvelope = (options = {}) => {
    try {
        const raw = localStorage.getItem(GLOBAL_SEARCH_CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        if (!cache || cache.cacheVersion !== APP_CACHE_SCHEMA_VERSION || !cache.payload) return null;

        const ageMs = Date.now() - Number(cache.savedAt || 0);
        const isExpired = ageMs > GLOBAL_SEARCH_CACHE_DURATION_MS;
        if (isExpired && options.allowExpired !== true) return null;
        return { ...cache, ageMs, isExpired };
    } catch (error) {
        localStorage.removeItem(GLOBAL_SEARCH_CACHE_KEY);
        return null;
    }
};

window.getCachedGlobalSearchPayload = (options = {}) => {
    return window.getGlobalSearchCacheEnvelope(options)?.payload || null;
};

window.saveGlobalSearchPayload = (dataVersion = 0) => {
    const numericVersion = Number(dataVersion);
    window.saveJsonCache(GLOBAL_SEARCH_CACHE_KEY, {
        dataVersion: Number.isFinite(numericVersion) ? numericVersion : 0,
        versionCheckedAt: Date.now(),
        payload: {
            allStudentsGlobalList: window.allStudentsGlobalList,
            classCategoryMap: window.classCategoryMap,
            categoryColorMap: window.categoryColorMap,
            classesByFacilityCategory: window.classesByFacilityCategory,
            categoryPrefixByFacilityCategory: window.categoryPrefixByFacilityCategory,
            facilityCategoriesMap: window.facilityCategoriesMap
        }
    });
};

window.markGlobalSearchCacheValidated = (dataVersion) => {
    try {
        const envelope = window.getGlobalSearchCacheEnvelope({ allowExpired: true });
        if (!envelope) return;
        const { ageMs, isExpired, ...cache } = envelope;
        cache.dataVersion = Number(dataVersion) || 0;
        cache.versionCheckedAt = Date.now();
        localStorage.setItem(GLOBAL_SEARCH_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.error("Khong the cap nhat trang thai cache tim kiem:", error);
    }
};

window.fetchGlobalSearchDataVersion = async (options = {}) => {
    const forceCheck = options.force === true;
    const cacheEnvelope = window.getGlobalSearchCacheEnvelope({ allowExpired: true });
    const checkedAt = Number(cacheEnvelope?.versionCheckedAt || 0);
    if (!forceCheck && cacheEnvelope && Date.now() - checkedAt < GLOBAL_SEARCH_VERSION_CHECK_INTERVAL_MS) {
        return Number(cacheEnvelope.dataVersion || 0);
    }

    if (globalSearchVersionCheckPromise) return globalSearchVersionCheckPromise;
    globalSearchVersionCheckPromise = getDoc(doc(db, GLOBAL_SEARCH_META_COLLECTION, GLOBAL_SEARCH_META_DOC))
        .then(snapshot => snapshot.exists() ? Number(snapshot.data()?.dataVersion || 0) : 0)
        .finally(() => {
            globalSearchVersionCheckPromise = null;
        });
    return globalSearchVersionCheckPromise;
};

window.revalidateGlobalSearchCache = async (cacheEnvelope) => {
    try {
        const remoteVersion = await window.fetchGlobalSearchDataVersion({ force: true });
        const cachedVersion = Number(cacheEnvelope?.dataVersion || 0);
        if (remoteVersion === cachedVersion) {
            window.markGlobalSearchCacheValidated(remoteVersion);
            return window.allStudentsGlobalList;
        }

        return window.loadAllStudentsForGlobalSearch({
            useCache: false,
            forceRefresh: true,
            refreshInBackground: false,
            knownDataVersion: remoteVersion
        });
    } catch (error) {
        console.error("Khong the kiem tra phien ban du lieu tim kiem:", error);
        if (cacheEnvelope?.isExpired) {
            return window.loadAllStudentsForGlobalSearch({
                useCache: false,
                forceRefresh: true,
                refreshInBackground: false
            });
        }
        return window.allStudentsGlobalList;
    }
};

window.bumpGlobalSearchDataVersion = async () => {
    if (globalSearchVersionBumpPromise) return globalSearchVersionBumpPromise;
    globalSearchVersionBumpPromise = setDoc(
        doc(db, GLOBAL_SEARCH_META_COLLECTION, GLOBAL_SEARCH_META_DOC),
        { dataVersion: increment(1), updatedAt: serverTimestamp() },
        { merge: true }
    ).catch(error => {
        console.error("Khong the tang phien ban du lieu tim kiem:", error);
    }).finally(() => {
        globalSearchVersionBumpPromise = null;
    });
    return globalSearchVersionBumpPromise;
};

window.getClassOptionsFromGlobalIndex = (facilityName, khoiName) => {
    const key = window.makeDataKey(facilityName, khoiName);
    const classes = window.classesByFacilityCategory?.[key];
    if (!Array.isArray(classes) || classes.length === 0) return null;
    return {
        classes: [...new Set(classes)].sort((a, b) => a.localeCompare(b, "vi")),
        nxPrefix: window.categoryPrefixByFacilityCategory?.[key] || "",
        source: "memory"
    };
};

window.getCachedClassOptionsPayload = (facilityName, khoiName, options = {}) => {
    const key = window.makeDataKey(facilityName, khoiName);
    const memoryPayload = window.getClassOptionsFromGlobalIndex(facilityName, khoiName);
    const cache = options.allowStale
        ? window.getStaleJsonCache(CLASS_OPTIONS_CACHE_KEY)
        : window.getJsonCache(CLASS_OPTIONS_CACHE_KEY, CLASS_OPTIONS_CACHE_DURATION_MS);
    const entry = cache?.classes?.[key];
    const entryIsFresh = !!entry && Date.now() - Number(entry.savedAt || 0) <= CLASS_OPTIONS_CACHE_DURATION_MS;
    if (!options.allowStale && entry && !entryIsFresh && !memoryPayload) return null;

    const classes = memoryPayload?.classes?.length
        ? memoryPayload.classes
        : (Array.isArray(entry?.classes) ? entry.classes : []);
    if (classes.length === 0) return null;

    const hasMemoryPrefix = Object.prototype.hasOwnProperty.call(window.categoryPrefixByFacilityCategory || {}, key);
    const nxPrefix = hasMemoryPrefix
        ? (window.categoryPrefixByFacilityCategory[key] || "")
        : (entry?.nxPrefix || memoryPayload?.nxPrefix || "");
    return {
        classes: [...new Set(classes)],
        nxPrefix,
        source: memoryPayload ? "memory" : (entryIsFresh ? "localStorage" : "staleLocalStorage")
    };
};

window.saveCachedClassOptionsPayload = (facilityName, khoiName, payload = {}) => {
    try {
        const key = window.makeDataKey(facilityName, khoiName);
        const cache = window.getJsonCache(CLASS_OPTIONS_CACHE_KEY, CLASS_OPTIONS_CACHE_DURATION_MS) || {
            cacheVersion: APP_CACHE_SCHEMA_VERSION,
            savedAt: Date.now(),
            classes: {}
        };
        cache.classes = cache.classes && typeof cache.classes === "object" ? cache.classes : {};
        cache.classes[key] = {
            savedAt: Date.now(),
            classes: Array.isArray(payload.classes) ? payload.classes.slice() : [],
            nxPrefix: payload.nxPrefix || ""
        };
        cache.savedAt = Date.now();
        cache.cacheVersion = APP_CACHE_SCHEMA_VERSION;
        localStorage.setItem(CLASS_OPTIONS_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        localStorage.removeItem(CLASS_OPTIONS_CACHE_KEY);
    }
};

window.renderClassSelectOptions = (selectEl, classes = [], selectedValue = "") => {
    if (!selectEl) return;
    window.setSelectOptions(selectEl, "-- Chọn lớp --", [...new Set(classes)].sort((a, b) => a.localeCompare(b, "vi")), selectedValue);
};

window.invalidateClassOptionCaches = () => {
    localStorage.removeItem(CLASS_OPTIONS_CACHE_KEY);
    if (window.uiAsyncState) window.uiAsyncState.classOptionsFetches = {};
    if (window.uiAsyncState) window.uiAsyncState.reviewClassOptionsFetches = {};
};

window.invalidateStudentCaches = (options = {}) => {
    const clearGlobalSearch = options.clearGlobalSearch !== false;
    const markGlobalSearchChanged = options.markGlobalSearchChanged !== false;
    if (clearGlobalSearch) localStorage.removeItem(GLOBAL_SEARCH_CACHE_KEY);
    localStorage.removeItem(CLASS_STUDENTS_CACHE_KEY);
    window.invalidateClassOptionCaches?.();
    window.invalidateA2FilterCaches?.();
    studentSearchResultCache.clear();
    studentSearchFetchPromises.clear();
    if (clearGlobalSearch) {
        window.allStudentsGlobalList = [];
        window.studentsByFacilityClass = {};
        window.classesByFacilityCategory = {};
        window.categoryPrefixByFacilityCategory = {};
        window.uiAsyncState.isGlobalSearchReady = false;
    }
    if (markGlobalSearchChanged) window.bumpGlobalSearchDataVersion?.();
};

window.getClassStudentsPayloadFromList = (students = []) => {
    const classStudents = [];
    const studentSchoolMap = {};
    const studentDocIdByName = {};
    const studentGhiChuByName = {};

    students.forEach(data => {
        const name = data.studentName || data.name;
        if (!name) return;
        if (!classStudents.includes(name)) classStudents.push(name);
        studentSchoolMap[name] = data.school || "";
        studentDocIdByName[name] = data.id || "";
        studentGhiChuByName[name] = data.ghiChu != null ? String(data.ghiChu) : "";
    });

    classStudents.sort((a, b) => a.localeCompare(b, "vi"));
    return { classStudents, studentSchoolMap, studentDocIdByName, studentGhiChuByName };
};

window.applyClassStudentsPayload = (payload = {}) => {
    window.classStudents = Array.isArray(payload.classStudents) ? payload.classStudents.slice() : [];
    window.studentSchoolMap = payload.studentSchoolMap && typeof payload.studentSchoolMap === "object" ? { ...payload.studentSchoolMap } : {};
    window.studentDocIdByName = payload.studentDocIdByName && typeof payload.studentDocIdByName === "object" ? { ...payload.studentDocIdByName } : {};
    window.studentGhiChuByName = payload.studentGhiChuByName && typeof payload.studentGhiChuByName === "object" ? { ...payload.studentGhiChuByName } : {};
};

window.getCachedClassStudentsPayload = (facilityName, lop, options = {}) => {
    const key = window.makeDataKey(facilityName, lop);
    const globalStudents = window.studentsByFacilityClass?.[key];
    if (Array.isArray(globalStudents) && globalStudents.length > 0) {
        return window.getClassStudentsPayloadFromList(globalStudents);
    }

    const cache = options.allowStale
        ? window.getStaleJsonCache(CLASS_STUDENTS_CACHE_KEY)
        : window.getJsonCache(CLASS_STUDENTS_CACHE_KEY, CLASS_STUDENTS_CACHE_DURATION_MS);
    const entry = cache?.classes?.[key];
    if (!options.allowStale && entry && Date.now() - Number(entry.savedAt || 0) > CLASS_STUDENTS_CACHE_DURATION_MS) return null;
    return entry?.payload || null;
};

window.saveCachedClassStudentsPayload = (facilityName, lop, payload) => {
    try {
        const key = window.makeDataKey(facilityName, lop);
        const cache = window.getJsonCache(CLASS_STUDENTS_CACHE_KEY, CLASS_STUDENTS_CACHE_DURATION_MS) || {
            cacheVersion: APP_CACHE_SCHEMA_VERSION,
            savedAt: Date.now(),
            classes: {}
        };
        cache.classes = cache.classes && typeof cache.classes === "object" ? cache.classes : {};
        cache.classes[key] = { savedAt: Date.now(), payload };
        cache.savedAt = Date.now();
        cache.cacheVersion = APP_CACHE_SCHEMA_VERSION;
        localStorage.setItem(CLASS_STUDENTS_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        localStorage.removeItem(CLASS_STUDENTS_CACHE_KEY);
    }
};

window.normalizeA2Student = (data = {}, id = "") => {
    const className = data.className || "";
    const facility = data.facility || "CS1";
    return {
        id: id || data.id || "",
        name: data.studentName || data.name || "",
        studentName: data.studentName || data.name || "",
        className,
        facility,
        category: data.category || window.classCategoryMap?.[className] || "Khac",
        school: data.school || "",
        ghiChu: data.ghiChu != null ? String(data.ghiChu) : "",
        schedules: data.schedules || []
    };
};

window.getA2FilterKey = (fac = "", khoi = "", lop = "") => window.makeDataKey(fac, khoi, lop);

window.getCachedA2FilterStudents = (fac = "", khoi = "", lop = "") => {
    const key = window.getA2FilterKey(fac, khoi, lop);
    const cache = window.getJsonCache(A2_FILTER_STUDENTS_CACHE_KEY, A2_FILTER_STUDENTS_CACHE_DURATION_MS);
    const entry = cache?.filters?.[key];
    if (!entry || Date.now() - Number(entry.savedAt || 0) > A2_FILTER_STUDENTS_CACHE_DURATION_MS) return null;
    return Array.isArray(entry?.students) ? entry.students.slice() : null;
};

window.saveCachedA2FilterStudents = (fac = "", khoi = "", lop = "", students = []) => {
    try {
        const key = window.getA2FilterKey(fac, khoi, lop);
        const cache = window.getJsonCache(A2_FILTER_STUDENTS_CACHE_KEY, A2_FILTER_STUDENTS_CACHE_DURATION_MS) || {
            cacheVersion: APP_CACHE_SCHEMA_VERSION,
            savedAt: Date.now(),
            filters: {}
        };
        cache.filters = cache.filters && typeof cache.filters === "object" ? cache.filters : {};
        cache.filters[key] = {
            savedAt: Date.now(),
            students: Array.isArray(students) ? students.slice() : []
        };
        cache.savedAt = Date.now();
        cache.cacheVersion = APP_CACHE_SCHEMA_VERSION;
        localStorage.setItem(A2_FILTER_STUDENTS_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        localStorage.removeItem(A2_FILTER_STUDENTS_CACHE_KEY);
    }
};

window.invalidateA2FilterCaches = () => {
    localStorage.removeItem(A2_FILTER_STUDENTS_CACHE_KEY);
    if (window.uiAsyncState) window.uiAsyncState.filterStudentsFetches = {};
};

window.getA2RecordsKey = (facilityName = "", studentName = "", className = "") => window.makeDataKey(facilityName, studentName, className);

window.getCachedA2RecordsPayload = (facilityName = "", studentName = "", className = "") => {
    const key = window.getA2RecordsKey(facilityName, studentName, className);
    const cache = window.getJsonCache(A2_RECORDS_CACHE_KEY, A2_RECORDS_CACHE_DURATION_MS);
    const entry = cache?.records?.[key];
    if (!entry || Date.now() - Number(entry.savedAt || 0) > A2_RECORDS_CACHE_DURATION_MS) return null;
    return Array.isArray(entry?.data) ? entry.data.slice() : null;
};

window.saveCachedA2RecordsPayload = (facilityName = "", studentName = "", className = "", data = []) => {
    try {
        const key = window.getA2RecordsKey(facilityName, studentName, className);
        const cache = window.getJsonCache(A2_RECORDS_CACHE_KEY, A2_RECORDS_CACHE_DURATION_MS) || {
            cacheVersion: APP_CACHE_SCHEMA_VERSION,
            savedAt: Date.now(),
            records: {}
        };
        cache.records = cache.records && typeof cache.records === "object" ? cache.records : {};
        cache.records[key] = {
            savedAt: Date.now(),
            data: Array.isArray(data) ? data.slice() : []
        };
        cache.savedAt = Date.now();
        cache.cacheVersion = APP_CACHE_SCHEMA_VERSION;
        localStorage.setItem(A2_RECORDS_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        localStorage.removeItem(A2_RECORDS_CACHE_KEY);
    }
};

window.invalidateA2RecordsCache = () => {
    localStorage.removeItem(A2_RECORDS_CACHE_KEY);
    if (window.uiAsyncState) window.uiAsyncState.a2RecordFetches = {};
};

window.fetchA2FilteredStudents = async (fac = "", khoi = "", lop = "", options = {}) => {
    const key = window.getA2FilterKey(fac, khoi, lop);
    if (!options.forceRefresh) {
        const cached = window.getCachedA2FilterStudents(fac, khoi, lop);
        if (cached) return cached;
    }

    if (!window.uiAsyncState.filterStudentsFetches) window.uiAsyncState.filterStudentsFetches = {};
    if (!window.uiAsyncState.filterStudentsFetches[key]) {
        window.uiAsyncState.filterStudentsFetches[key] = (async () => {
            let students = [];
            let classSet = null;

            if (khoi && lop) {
                classSet = new Set([lop]);
            } else if (fac && khoi) {
                let classOptions = window.getCachedClassOptionsPayload?.(fac, khoi)?.classes || [];
                if (classOptions.length === 0) {
                    const classSnap = await getDocs(query(collection(db, "classes"), where("category", "==", khoi), where("facility", "==", fac)));
                    classOptions = classSnap.docs.map(d => d.data().name).filter(Boolean);
                    window.saveCachedClassOptionsPayload?.(fac, khoi, { classes: classOptions });
                }
                classSet = new Set(classOptions);
            }

            if (fac && lop) {
                const snap = await getDocs(query(collection(db, "students"), where("facility", "==", fac), where("className", "==", lop)));
                students = snap.docs.map(d => window.normalizeA2Student(d.data(), d.id));
            } else if (fac) {
                const snap = await getDocs(query(collection(db, "students"), where("facility", "==", fac)));
                students = snap.docs.map(d => window.normalizeA2Student(d.data(), d.id));
            } else {
                await window.loadAllStudentsForGlobalSearch({ refreshInBackground: false });
                students = window.allStudentsGlobalList.slice();
            }

            if (classSet) {
                students = students
                    .filter(hs => classSet.has(hs.className))
                    .map(hs => ({ ...hs, category: khoi || hs.category }));
            } else if (khoi) {
                students = students.filter(hs => hs.category === khoi);
            }
            if (lop) students = students.filter(hs => hs.className === lop);

            students.sort((a, b) => {
                if (a.className === b.className) return a.name.localeCompare(b.name, "vi");
                return a.className.localeCompare(b.className, "vi");
            });

            window.saveCachedA2FilterStudents(fac, khoi, lop, students);
            return students;
        })().finally(() => {
            delete window.uiAsyncState.filterStudentsFetches[key];
        });
    }

    return window.uiAsyncState.filterStudentsFetches[key];
};

window.fetchA2RecordsForStudent = async (studentName = "", className = "", facilityName = "", options = {}) => {
    const key = window.getA2RecordsKey(facilityName, studentName, className);
    if (!options.forceRefresh) {
        const cached = window.getCachedA2RecordsPayload(facilityName, studentName, className);
        if (cached) return cached;
    }

    if (!window.uiAsyncState.a2RecordFetches) window.uiAsyncState.a2RecordFetches = {};
    if (!window.uiAsyncState.a2RecordFetches[key]) {
        window.uiAsyncState.a2RecordFetches[key] = (async () => {
            const filters = [where("studentName", "==", studentName), where("className", "==", className)];
            if (facilityName) filters.push(where("facility", "==", facilityName));
            const snap = await getDocs(query(collection(db, "records"), ...filters));
            let docs = snap.docs;

            // Dữ liệu mới dùng studentId ổn định. Chỉ truy vấn dự phòng theo ID
            // khi tên mới chưa khớp dữ liệu cũ để không tăng reads ở luồng bình thường.
            const studentId = String(options.studentId || "").trim();
            if (docs.length === 0 && studentId) {
                const idSnap = await getDocs(query(collection(db, "records"), where("studentId", "==", studentId)));
                docs = idSnap.docs.filter(recordDoc => {
                    const record = recordDoc.data();
                    return (!className || record.className === className)
                        && (!facilityName || window.getFacilityCode(record.facility) === window.getFacilityCode(facilityName));
                });
            }

            const data = docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => {
                const tA = window.parseDateVn(a.date);
                const tB = window.parseDateVn(b.date);
                if (tA !== tB) return tB - tA;
                return (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0);
            });
            window.saveCachedA2RecordsPayload(facilityName, studentName, className, data);
            return data;
        })().finally(() => {
            delete window.uiAsyncState.a2RecordFetches[key];
        });
    }

    return window.uiAsyncState.a2RecordFetches[key];
};

window.resetTeacherClassData = () => {
    window.uiAsyncState.classRequestId += 1;
    window.uiAsyncState.scheduleRequestId += 1;
    window.uiAsyncState.studentsRequestId += 1;
    window.uiAsyncState.classesStatus = "idle";
    window.uiAsyncState.studentsStatus = "idle";
    window.classStudents = [];
    window.addedStudents.clear();
    window.tempCache = {};
    window.studentSchoolMap = {};
    window.studentDocIdByName = {};
    window.studentGhiChuByName = {};
    window.resetLessonInstanceId?.();
    window.clearTeacherWorkingDraft?.({
        clearGlobalContent: true,
        clearCards: true,
        clearPersisted: !isRestoringAppState
    });
    document.body.classList.remove("teacher-class-selected");

    window.populateShiftSelect();

    const sCont = document.getElementById("search-student-container");
    if (sCont) sCont.style.display = "none";
    const aCards = document.getElementById("area-cards");
    if (aCards) aCards.innerHTML = "";
    const sFoot = document.getElementById("save-footer");
    if (sFoot) sFoot.style.display = "none";
    window.setTeacherClassLoadStatus?.("idle");
};

window.getFacilityCategories = async (facilityName) => {
    if (!facilityName) return [];
    if (!Array.isArray(window.facilityCategoriesMap?.[facilityName]) && window.initPromise) {
        await window.waitForInitialData();
    }

    let list = Array.isArray(window.facilityCategoriesMap?.[facilityName])
        ? window.facilityCategoriesMap[facilityName].slice()
        : [];

    if (list.length === 0) {
        if (!window.uiAsyncState.facilityCategoryFetches[facilityName]) {
            window.uiAsyncState.facilityCategoryFetches[facilityName] = window.measureUiRequest(
                "spt:facility-categories",
                () => window.withUiReadRetry(() => window.withUiTimeout(
                    getDocs(query(collection(db, "categories"), where("facility", "==", facilityName))),
                    FIRESTORE_UI_QUERY_TIMEOUT_MS,
                    "Tải danh sách khối quá thời gian"
                ))
            ).finally(() => {
                delete window.uiAsyncState.facilityCategoryFetches[facilityName];
            });
        }
        const snap = await window.uiAsyncState.facilityCategoryFetches[facilityName];
        list = snap.docs.map(d => d.data().name).filter(Boolean);
        window.facilityCategoriesMap[facilityName] = [...new Set(list)];
    }

    return [...new Set(list)].sort((a, b) => a.localeCompare(b, "vi"));
};

window.clearStudentDrafts = (ten) => {
    localStorage.removeItem(`draft_nd_${ten}`);
    try {
        Object.keys(localStorage).forEach((k) => {
            if (k.startsWith(`draft_nx_${ten}_`)) localStorage.removeItem(k);
        });
    } catch (e) { }
};

window.collectTeacherWorkingDraft = () => {
    const cards = Array.from(document.querySelectorAll("#area-cards .student-card")).map((card, order) => ({
        order,
        name: card.getAttribute("data-name") || "",
        studentId: card.getAttribute("data-student-doc-id") || "",
        note: card.getAttribute("data-note") || "",
        content: card.querySelector(".input-nd")?.value || "",
        comments: Array.from(card.querySelectorAll(".input-nx-dynamic")).map(input => ({
            label: input.getAttribute("data-label") || "",
            value: input.value || ""
        })),
        savedTemp: card.classList.contains("card-saved-temp")
    })).filter(card => card.name);

    let tempCache = {};
    try {
        tempCache = JSON.parse(JSON.stringify(window.tempCache || {}));
    } catch (error) {
        tempCache = {};
    }

    return {
        version: TEACHER_WORKING_DRAFT_VERSION,
        savedAt: Date.now(),
        context: {
            facility: document.getElementById("select-facility-gv")?.value || "",
            khoi: document.getElementById("select-khoi-gv")?.value || "",
            lop: document.getElementById("select-lop-gv")?.value || "",
            schedule: document.getElementById("select-schedule-gv")?.value || "",
            ngayDay: document.getElementById("ngayDay")?.value || "",
            teacherName: document.getElementById("tenGV")?.value || "",
            lessonInstanceId: window.currentLessonInstanceId || ""
        },
        cards,
        globalContent: document.getElementById("global-nd-input")?.value || "",
        searchText: document.getElementById("inlineSearchInput")?.value || "",
        reportContent: document.getElementById("global-report-content")?.value || "",
        tempCache
    };
};

window.getTeacherWorkingDraft = () => {
    try {
        const raw = localStorage.getItem(TEACHER_WORKING_DRAFT_KEY);
        if (!raw) return null;
        const draft = JSON.parse(raw);
        if (draft?.version !== TEACHER_WORKING_DRAFT_VERSION
            || !draft.savedAt
            || Date.now() - Number(draft.savedAt) > TEACHER_WORKING_DRAFT_DURATION_MS) {
            localStorage.removeItem(TEACHER_WORKING_DRAFT_KEY);
            return null;
        }
        return draft;
    } catch (error) {
        localStorage.removeItem(TEACHER_WORKING_DRAFT_KEY);
        return null;
    }
};

window.persistTeacherWorkingDraft = (draft = window.collectTeacherWorkingDraft?.()) => {
    if (window.currentRole !== "teacher" || !draft) return null;
    const hasMeaningfulData = !!draft.context?.lop
        || (Array.isArray(draft.cards) && draft.cards.length > 0)
        || Object.keys(draft.tempCache || {}).length > 0
        || !!draft.globalContent
        || !!draft.reportContent;
    if (!hasMeaningfulData) return null;

    try {
        draft.savedAt = Date.now();
        localStorage.setItem(TEACHER_WORKING_DRAFT_KEY, JSON.stringify(draft));
        return draft;
    } catch (error) {
        console.warn("Khong the luu ban nhap giao vien tren thiet bi:", error);
        return null;
    }
};

window.clearPersistedTeacherWorkingDraft = () => {
    localStorage.removeItem(TEACHER_WORKING_DRAFT_KEY);
};

window.teacherDraftMatchesContext = (draft, context = {}) => {
    if (!draft?.context?.lop || !context?.lop) return false;
    const draftFacility = window.getFacilityCode(draft.context.facility || "");
    const contextFacility = window.getFacilityCode(context.facility || "");
    return draft.context.lop === context.lop
        && (!draftFacility || !contextFacility || draftFacility === contextFacility);
};

window.applyTeacherWorkingDraft = (draft) => {
    const context = {
        facility: document.getElementById("select-facility-gv")?.value || "",
        lop: document.getElementById("select-lop-gv")?.value || ""
    };
    if (!window.teacherDraftMatchesContext(draft, context)) return false;

    window.currentLessonInstanceId = String(draft.context?.lessonInstanceId || "");

    const globalInput = document.getElementById("global-nd-input");
    const searchInput = document.getElementById("inlineSearchInput");
    const reportInput = document.getElementById("global-report-content");
    if (globalInput) globalInput.value = draft.globalContent || "";
    if (searchInput) searchInput.value = draft.searchText || "";
    if (reportInput) reportInput.value = draft.reportContent || "";

    window.tempCache = draft.tempCache && typeof draft.tempCache === "object"
        ? JSON.parse(JSON.stringify(draft.tempCache))
        : {};

    const cards = Array.isArray(draft.cards) ? draft.cards.slice().sort((a, b) => Number(a.order) - Number(b.order)) : [];
    cards.forEach(cardDraft => {
        window.addStudentCard?.(cardDraft.name);
        const card = window.getSavedStudentCard?.(cardDraft.name);
        if (!card) return;

        if (cardDraft.studentId) card.setAttribute("data-student-doc-id", cardDraft.studentId);
        card.setAttribute("data-note", cardDraft.note || "");
        const contentInput = card.querySelector(".input-nd");
        if (contentInput) contentInput.value = cardDraft.content || "";

        const commentDrafts = Array.isArray(cardDraft.comments) ? cardDraft.comments : [];
        const commentsByLabel = new Map(commentDrafts.map(item => [String(item.label || ""), item.value || ""]));
        card.querySelectorAll(".input-nx-dynamic").forEach((input, index) => {
            const label = input.getAttribute("data-label") || "";
            input.value = commentsByLabel.has(label) ? commentsByLabel.get(label) : (commentDrafts[index]?.value || "");
        });

        if (cardDraft.savedTemp && window.tempCache[cardDraft.name]) {
            card.classList.add("card-saved-temp");
            const saveButton = card.querySelector(".btn-luu-hs");
            if (saveButton) {
                saveButton.className = "btn btn-sm btn-success text-white btn-luu-hs";
                saveButton.innerHTML = `<i class="fas fa-check"></i>`;
            }
        }
    });

    window.updateStudentIndices?.();
    window.initDragAndDrop?.();
    window.syncNhapLieuFormState?.();
    return true;
};

window.ensureTeacherInfoPanelVisible = () => {
    const filter4Bars = document.getElementById("filter-4-bars");
    if (filter4Bars) filter4Bars.style.display = "block";

    const toggleBtn = document.getElementById("toggle-4-bars-btn");
    if (toggleBtn) toggleBtn.style.display = "none";
};

window.syncTeacherClassDependentUI = () => {
    const hasSelectedClass = !!document.getElementById("select-lop-gv")?.value;
    document.body.classList.toggle("teacher-class-selected", hasSelectedClass);
    return hasSelectedClass;
};

window.getStudentSearchIndexStatus = async (options = {}) => {
    const force = options.force === true;
    const cached = !force
        ? window.getJsonCache(STUDENT_SEARCH_INDEX_STATUS_CACHE_KEY, STUDENT_SEARCH_INDEX_STATUS_CACHE_MS)
        : null;
    if (cached?.status) return cached.status;
    if (studentSearchIndexStatusPromise) return studentSearchIndexStatusPromise;

    studentSearchIndexStatusPromise = getDoc(doc(db, GLOBAL_SEARCH_META_COLLECTION, STUDENT_SEARCH_INDEX_META_DOC))
        .then(snapshot => {
            const data = snapshot.exists() ? snapshot.data() : {};
            const status = {
                ready: data.ready === true && Number(data.version || 0) === STUDENT_SEARCH_INDEX_VERSION,
                version: Number(data.version || 0),
                studentCount: Number(data.studentCount || 0)
            };
            window.saveJsonCache(STUDENT_SEARCH_INDEX_STATUS_CACHE_KEY, { status });
            return status;
        })
        .catch(error => {
            console.error("Khong the kiem tra chi muc tim hoc sinh:", error);
            return { ready: false, version: 0, studentCount: 0 };
        })
        .finally(() => {
            studentSearchIndexStatusPromise = null;
        });

    return studentSearchIndexStatusPromise;
};

window.ensureStudentSearchIndex = async () => {
    if (window.currentRole !== "admin" || !auth?.currentUser) return { ready: false, skipped: true };
    if (studentSearchMigrationPromise) return studentSearchMigrationPromise;

    studentSearchMigrationPromise = (async () => {
        const currentStatus = await window.getStudentSearchIndexStatus();
        if (currentStatus.ready) return currentStatus;

        const snapshot = await getDocs(collection(db, "students"));
        let batch = writeBatch(db);
        let pendingWrites = 0;
        let updatedCount = 0;

        for (const studentDoc of snapshot.docs) {
            const data = studentDoc.data();
            const studentName = data.studentName || data.name || "";
            const expected = window.getStudentSearchDocumentFields(studentName);
            const alreadyIndexed = Number(data.searchIndexVersion || 0) === STUDENT_SEARCH_INDEX_VERSION
                && data.searchNormalized === expected.searchNormalized
                && Array.isArray(data.searchTerms);
            if (alreadyIndexed) continue;

            batch.update(studentDoc.ref, expected);
            pendingWrites += 1;
            updatedCount += 1;
            if (pendingWrites >= 400) {
                await batch.commit();
                batch = writeBatch(db);
                pendingWrites = 0;
            }
        }
        if (pendingWrites > 0) await batch.commit();

        const status = {
            ready: true,
            version: STUDENT_SEARCH_INDEX_VERSION,
            studentCount: snapshot.size,
            updatedCount
        };
        await setDoc(doc(db, GLOBAL_SEARCH_META_COLLECTION, STUDENT_SEARCH_INDEX_META_DOC), {
            ready: true,
            version: STUDENT_SEARCH_INDEX_VERSION,
            studentCount: snapshot.size,
            updatedAt: serverTimestamp()
        }, { merge: true });
        window.saveJsonCache(STUDENT_SEARCH_INDEX_STATUS_CACHE_KEY, { status });
        studentSearchResultCache.clear();
        studentSearchFetchPromises.clear();
        return status;
    })().catch(error => {
        console.error("Khong the tao chi muc tim hoc sinh:", error);
        throw error;
    }).finally(() => {
        studentSearchMigrationPromise = null;
    });

    return studentSearchMigrationPromise;
};

window.mergeStudentSearchResults = (students = []) => {
    const byId = new Map((window.allStudentsGlobalList || []).map(student => [student.id, student]));
    students.forEach(student => {
        if (student?.id) byId.set(student.id, { ...(byId.get(student.id) || {}), ...student });
    });
    window.allStudentsGlobalList = [...byId.values()];
};

window.searchStudentsByName = async (searchText = "") => {
    const normalizedQuery = window.normalizeSearchText(searchText);
    if (normalizedQuery.length < STUDENT_SEARCH_MIN_LENGTH) {
        return { results: [], indexed: true, fromCache: false };
    }

    const cached = studentSearchResultCache.get(normalizedQuery);
    if (cached && Date.now() - cached.savedAt < STUDENT_SEARCH_RESULTS_CACHE_MS) {
        return { results: cached.results.slice(), indexed: true, fromCache: true };
    }
    if (studentSearchFetchPromises.has(normalizedQuery)) {
        return studentSearchFetchPromises.get(normalizedQuery);
    }

    const searchPromise = (async () => {
        const indexStatus = await window.getStudentSearchIndexStatus();
        if (!indexStatus.ready) {
            await window.loadAllStudentsForGlobalSearch({ refreshInBackground: false });
            const localResults = (window.allStudentsGlobalList || [])
                .filter(student => window.normalizeSearchText(student.name || student.studentName).includes(normalizedQuery))
                .slice(0, STUDENT_SEARCH_QUERY_LIMIT);
            return { results: localResults, indexed: false, fromCache: true };
        }

        const studentsQuery = query(
            collection(db, "students"),
            where("searchTerms", "array-contains", normalizedQuery),
            limit(STUDENT_SEARCH_QUERY_LIMIT)
        );
        const snapshot = await getDocs(studentsQuery);
        const results = snapshot.docs
            .map(studentDoc => window.normalizeA2Student(studentDoc.data(), studentDoc.id))
            .sort((a, b) => a.name.localeCompare(b.name, "vi") || a.className.localeCompare(b.className, "vi"));

        studentSearchResultCache.set(normalizedQuery, { savedAt: Date.now(), results });
        window.mergeStudentSearchResults(results);
        return { results: results.slice(), indexed: true, fromCache: false };
    })().finally(() => {
        studentSearchFetchPromises.delete(normalizedQuery);
    });

    studentSearchFetchPromises.set(normalizedQuery, searchPromise);
    return searchPromise;
};

window.searchStudentsByExactName = async (studentName = "") => {
    const normalizedName = window.normalizeSearchText(studentName);
    if (normalizedName.length < STUDENT_SEARCH_MIN_LENGTH) {
        return { results: [], indexed: true, fromCache: false };
    }

    const indexStatus = await window.getStudentSearchIndexStatus();
    if (!indexStatus.ready) {
        await window.loadAllStudentsForGlobalSearch({ refreshInBackground: false });
        const localResults = (window.allStudentsGlobalList || []).filter(student =>
            window.normalizeSearchText(student.name || student.studentName) === normalizedName
        );
        return { results: localResults, indexed: false, fromCache: true };
    }

    const cacheKey = `exact:${normalizedName}`;
    const cached = studentSearchResultCache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < STUDENT_SEARCH_RESULTS_CACHE_MS) {
        return { results: cached.results.slice(), indexed: true, fromCache: true };
    }
    if (studentSearchFetchPromises.has(cacheKey)) return studentSearchFetchPromises.get(cacheKey);

    const searchPromise = getDocs(query(
        collection(db, "students"),
        where("searchNormalized", "==", normalizedName),
        limit(STUDENT_SEARCH_QUERY_LIMIT)
    )).then(snapshot => {
        const results = snapshot.docs
            .map(studentDoc => window.normalizeA2Student(studentDoc.data(), studentDoc.id))
            .sort((a, b) => a.className.localeCompare(b.className, "vi"));
        studentSearchResultCache.set(cacheKey, { savedAt: Date.now(), results });
        window.mergeStudentSearchResults(results);
        return { results: results.slice(), indexed: true, fromCache: false };
    }).finally(() => {
        studentSearchFetchPromises.delete(cacheKey);
    });

    studentSearchFetchPromises.set(cacheKey, searchPromise);
    return searchPromise;
};

window.escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

window.syncNhapLieuFormState = () => {
    const nhapPage = document.getElementById("nhap-lieu");
    if (nhapPage && !nhapPage.classList.contains("active") && nhapPage.style.display === "none") return;

    const lop = document.getElementById("select-lop-gv")?.value || "";
    const step3Form = document.getElementById("step-3-form-nl");
    const searchContainer = document.getElementById("search-student-container");
    const area = document.getElementById("area-cards");
    const footer = document.getElementById("save-footer");
    const hasCards = !!area?.querySelector(".student-card");
    window.syncTeacherClassDependentUI?.();

    if (!lop) {
        if (footer) footer.style.display = "none";
        return;
    }

    if (step3Form) {
        step3Form.style.display = "block";
        step3Form.classList.add("mobile-show-form");
    }
    window.ensureTeacherInfoPanelVisible?.();
    if (searchContainer) searchContainer.style.display = "block";
    if (footer) footer.style.display = hasCards ? "block" : "none";

    if (window.innerWidth <= 768) {
        document.body.setAttribute("data-wizard-step", "3");
    }
};
window.currentStudentId = "";
window.handleStudentChangeEffect = (nextStudentId) => {
    if (!nextStudentId || window.currentStudentId === nextStudentId) return;
    window.currentStudentId = nextStudentId;
};

window.resetStudentCardInputs = (card, ten = "") => {
    if (!card) return;
    const ndInput = card.querySelector('.input-nd');
    if (ndInput) ndInput.value = "";
    card.querySelectorAll('.input-nx-dynamic').forEach((inp) => {
        inp.value = "";
    });
    card.classList.remove('card-saved-temp');
    const btn = card.querySelector('.btn-luu-hs');
    if (btn) {
        btn.className = "btn btn-sm btn-outline-secondary btn-luu-hs";
        btn.innerHTML = `<i class="fas fa-save"></i>`;
    }
    if (ten) delete window.tempCache[ten];
};

window.clearTeacherWorkingDraft = (options = {}) => {
    const { clearGlobalContent = true, clearCards = true, clearPersisted = false } = options;
    window.tempCache = {};
    window.currentStudentId = "";
    window.resetLessonInstanceId?.();
    if (window.addedStudents && typeof window.addedStudents.clear === "function") {
        window.addedStudents.clear();
    }

    const reportContent = document.getElementById("global-report-content");
    if (reportContent) reportContent.value = "";
    const searchInput = document.getElementById("inlineSearchInput");
    if (searchInput) searchInput.value = "";
    const picker = document.getElementById("studentPickerList");
    if (picker) {
        picker.innerHTML = "";
        picker.style.display = "none";
    }
    document.body.classList.remove("student-picker-open");
    if (clearGlobalContent) {
        const globalInput = document.getElementById("global-nd-input");
        if (globalInput) globalInput.value = "";
    }
    if (clearCards) {
        const area = document.getElementById("area-cards");
        if (area) area.innerHTML = "";
    }
    if (clearPersisted) window.clearPersistedTeacherWorkingDraft?.();
};

window.clearGeneratedReport = () => {
    const reportContent = document.getElementById("global-report-content");
    if (reportContent) reportContent.value = "";
};

window.getDayClass = (text) => {
    if (!text) return '';
    const t = text.toLowerCase();
    if (t.includes('thứ 2') || t.includes('t2')) return 'day-t2';
    if (t.includes('thứ 3') || t.includes('t3')) return 'day-t3';
    if (t.includes('thứ 4') || t.includes('t4')) return 'day-t4';
    if (t.includes('thứ 5') || t.includes('t5')) return 'day-t5';
    if (t.includes('thứ 6') || t.includes('t6')) return 'day-t6';
    if (t.includes('thứ 7') || t.includes('t7')) return 'day-t7';
    if (t.includes('chủ nhật') || t.includes('cn')) return 'day-cn';
    return '';
};

window.updateSelectColor = (selectEl) => {
    if (!selectEl) return;
    selectEl.classList.remove('day-t2', 'day-t3', 'day-t4', 'day-t5', 'day-t6', 'day-t7', 'day-cn');
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    if (selectedOption && selectedOption.value !== "") {
        const dayClass = window.getDayClass(selectedOption.text);
        if (dayClass) {
            selectEl.classList.add(dayClass);
        }
    }
};

window.setTeacherSession = () => {
    localStorage.setItem(TEACHER_SESSION_KEY, JSON.stringify({
        role: "teacher",
        savedAt: Date.now()
    }));
};

window.hasValidTeacherSession = () => {
    try {
        const raw = localStorage.getItem(TEACHER_SESSION_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        return data?.role === "teacher" && Date.now() - Number(data.savedAt || 0) < TEACHER_SESSION_DURATION_MS;
    } catch (e) {
        localStorage.removeItem(TEACHER_SESSION_KEY);
        return false;
    }
};

window.getSavedAppState = () => {
    try {
        const raw = localStorage.getItem(APP_STATE_KEY);
        if (!raw) return null;
        const state = JSON.parse(raw);
        if (!state?.savedAt || state.cacheVersion !== APP_CACHE_SCHEMA_VERSION || Date.now() - state.savedAt > APP_STATE_DURATION_MS) {
            localStorage.removeItem(APP_STATE_KEY);
            return null;
        }
        return state;
    } catch (e) {
        localStorage.removeItem(APP_STATE_KEY);
        return null;
    }
};

window.clearSavedAppState = () => localStorage.removeItem(APP_STATE_KEY);

const serializeElementWithFormValues = (element) => {
    const clone = element.cloneNode(true);
    const sourceFields = element.querySelectorAll("input, textarea, select");
    const clonedFields = clone.querySelectorAll("input, textarea, select");

    sourceFields.forEach((source, index) => {
        const target = clonedFields[index];
        if (!target) return;

        if (source.tagName === "TEXTAREA") {
            target.textContent = source.value;
            target.setAttribute("value", source.value);
            return;
        }

        if (source.tagName === "SELECT") {
            Array.from(target.options).forEach((option, optionIndex) => {
                const isSelected = source.options[optionIndex]?.selected || false;
                option.selected = isSelected;
                if (isSelected) option.setAttribute("selected", "selected");
                else option.removeAttribute("selected");
            });
            target.value = source.value;
            return;
        }

        if (source.type === "checkbox" || source.type === "radio") {
            if (source.checked) target.setAttribute("checked", "checked");
            else target.removeAttribute("checked");
            return;
        }

        target.setAttribute("value", source.value);
    });

    if (element.id === "nhap-lieu") {
        const volatileSelectors = [
            "#global-report-content",
            "#global-nd-input",
            "#inlineSearchInput"
        ];
        volatileSelectors.forEach(selector => {
            const field = clone.querySelector(selector);
            if (!field) return;
            field.value = "";
            field.textContent = "";
            field.setAttribute("value", "");
        });

        const area = clone.querySelector("#area-cards");
        if (area) area.innerHTML = "";
        const footer = clone.querySelector("#save-footer");
        if (footer) footer.style.display = "none";
        const picker = clone.querySelector("#studentPickerList");
        if (picker) {
            picker.innerHTML = "";
            picker.style.display = "none";
        }
    }

    return clone.innerHTML;
};

window.getAppDomCache = () => {
    try {
        const raw = localStorage.getItem(APP_DOM_CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        if (!cache?.savedAt || cache.cacheVersion !== APP_CACHE_SCHEMA_VERSION || Date.now() - cache.savedAt > APP_DOM_CACHE_DURATION_MS) {
            localStorage.removeItem(APP_DOM_CACHE_KEY);
            return null;
        }
        return cache;
    } catch (e) {
        localStorage.removeItem(APP_DOM_CACHE_KEY);
        return null;
    }
};

window.clearAppDomCache = () => localStorage.removeItem(APP_DOM_CACHE_KEY);

window.saveAppDomCache = (state) => {
    const activeTab = state?.activeTab || "";
    if (window.currentRole !== "teacher" || !TEACHER_DOM_CACHE_TABS.has(activeTab)) return;

    // The teacher entry page contains live form controls. Restoring its innerHTML
    // recreates stale elements without their current state/listeners, so that page
    // is restored from the structured draft instead.
    if (activeTab === "nhap-lieu") {
        const existingCache = window.getAppDomCache?.();
        if (existingCache?.activeTab === "nhap-lieu") window.clearAppDomCache?.();
        return;
    }

    const activePage = document.getElementById(activeTab);
    if (!activePage) return;

    try {
        const cache = {
            cacheVersion: APP_CACHE_SCHEMA_VERSION,
            savedAt: Date.now(),
            role: window.currentRole,
            activeTab,
            wizardStep: state.wizardStep || "",
            scrollY: window.scrollY || 0,
            pageHtml: serializeElementWithFormValues(activePage),
            nhapLieuHtml: activeTab === "nhap-lieu" ? serializeElementWithFormValues(activePage) : "",
            addedStudents: [],
            tempCache: {}
        };
        localStorage.setItem(APP_DOM_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        localStorage.removeItem(APP_DOM_CACHE_KEY);
    }
};

window.restoreCachedDomState = (role = window.currentRole, targetTab = "") => {
    if (role !== "teacher" || !TEACHER_DOM_CACHE_TABS.has(targetTab)) return false;

    if (targetTab === "nhap-lieu") {
        const existingCache = window.getAppDomCache?.();
        if (existingCache?.activeTab === "nhap-lieu") window.clearAppDomCache?.();
        return false;
    }

    const cache = window.getAppDomCache();
    const activePage = document.getElementById(targetTab);
    const cachedHtml = cache?.pageHtml || (targetTab === "nhap-lieu" ? cache?.nhapLieuHtml : "");
    if (!cache || cache.role !== role || cache.activeTab !== targetTab || !cachedHtml || !activePage) {
        return false;
    }

    try {
        activePage.innerHTML = cachedHtml;
        window.addedStudents = new Set(Array.isArray(cache.addedStudents) ? cache.addedStudents : []);
        window.tempCache = cache.tempCache && typeof cache.tempCache === "object" ? cache.tempCache : {};
        if (cache.wizardStep) {
            const cachedLop = targetTab === "nhap-lieu" ? (document.getElementById("select-lop-gv")?.value || "") : "";
            document.body.setAttribute("data-wizard-step", cachedLop ? "3" : cache.wizardStep);
        }

        fastDomCacheRestored = true;
        fastDomCacheRestoredTab = targetTab;
        requestAnimationFrame(() => {
            if (targetTab === "nhap-lieu") {
                window.updateStudentIndices?.();
                window.initDragAndDrop?.();
                window.syncNhapLieuFormState?.();
                const lop = document.getElementById("select-lop-gv")?.value || "";
                const hasCards = !!document.querySelector("#area-cards .student-card");
                if (lop && !hasCards) {
                    window.loadSchedulesForClass?.({
                        selectedSchedule: document.getElementById("select-schedule-gv")?.value || ""
                    });
                }
            }
            if (targetTab === "dashboard") {
                window.initNewsSwipe?.();
            }
            if (targetTab === "quan-ly") {
                window.rehydrateReviewFilters?.();
            }
            window.scrollTo(0, Number(cache.scrollY || 0));
        });
        return true;
    } catch (e) {
        window.clearAppDomCache();
        return false;
    }
};

window.saveAppState = () => {
    if (isRestoringAppState || !window.currentRole) return;

    const activeTab = document.querySelector(".page-section.active")?.id || "";
    const teacherDraft = window.currentRole === "teacher"
        ? window.collectTeacherWorkingDraft?.()
        : null;
    if (teacherDraft) window.persistTeacherWorkingDraft?.(teacherDraft);
    const state = {
        cacheVersion: APP_CACHE_SCHEMA_VERSION,
        savedAt: Date.now(),
        role: window.currentRole,
        activeTab,
        scrollY: window.scrollY || 0,
        wizardStep: document.body.getAttribute("data-wizard-step") || "",
        teacher: {
            facility: teacherDraft?.context?.facility || document.getElementById("select-facility-gv")?.value || "",
            khoi: teacherDraft?.context?.khoi || document.getElementById("select-khoi-gv")?.value || "",
            lop: teacherDraft?.context?.lop || document.getElementById("select-lop-gv")?.value || "",
            schedule: teacherDraft?.context?.schedule || document.getElementById("select-schedule-gv")?.value || "",
            ngayDay: teacherDraft?.context?.ngayDay || document.getElementById("ngayDay")?.value || "",
            teacherName: teacherDraft?.context?.teacherName || document.getElementById("tenGV")?.value || "",
            lessonInstanceId: teacherDraft?.context?.lessonInstanceId || window.currentLessonInstanceId || "",
            selectedStudents: teacherDraft?.cards?.map(card => card.name) || [],
            draftCards: teacherDraft?.cards || [],
            globalContent: teacherDraft?.globalContent || "",
            searchText: teacherDraft?.searchText || "",
            reportContent: teacherDraft?.reportContent || "",
            tempCache: teacherDraft?.tempCache || {}
        },
        review: {
            facility: document.getElementById("filter-facility")?.value || "",
            khoi: document.getElementById("filter-khoi")?.value || "",
            lop: document.getElementById("filter-lop")?.value || "",
            studentSearch: document.getElementById("global-hs-search-input")?.value || ""
        }
    };

    try {
        localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
        window.saveAppDomCache(state);
    } catch (error) {
        console.warn("Khong the luu trang thai ung dung tren thiet bi:", error);
    }
};

window.scheduleSaveAppState = () => {
    if (isRestoringAppState) return;
    clearTimeout(appStateSaveTimer);
    appStateSaveTimer = setTimeout(() => window.saveAppState(), 150);
};

window.getRestorableTab = (role, savedState) => {
    const tab = savedState?.activeTab || "";
    if (role === "teacher") return ["dashboard", "nhap-lieu", "quan-ly"].includes(tab) ? tab : "nhap-lieu";
    return ["dashboard", "nhap-lieu", "quan-ly", "du-lieu", "tai-khoan"].includes(tab) ? tab : "dashboard";
};

window.setActiveButtonByText = (containerId, value) => {
    if (!value) return;
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll("button").forEach(btn => {
        const isMatch = btn.textContent.trim().toLowerCase().includes(String(value).trim().toLowerCase());
        btn.classList.toggle("active", isMatch);
    });
};

window.showAuthenticatedApp = function (role, fallbackTab = "nhap-lieu") {
    const mainApp = document.getElementById("mainApp");
    const appAlreadyVisible = window.currentRole === role && mainApp && mainApp.style.display === "block";

    window.currentRole = role;
    if (role === "admin") localStorage.setItem("userRole", "admin");
    if (role === "teacher") window.setTeacherSession();

    const roleScreen = document.getElementById("roleSelectionScreen");
    const adminScreen = document.getElementById("admin-login-screen");
    const loader = document.getElementById("global-loader");

    if (roleScreen) roleScreen.style.display = "none";
    if (adminScreen) adminScreen.style.display = "none";
    if (mainApp) mainApp.style.display = "block";
    window.applyRolePermissions?.();

    if (!appAlreadyVisible) {
        const savedState = window.getSavedAppState();
        const targetTab = window.getRestorableTab(role, savedState) || fallbackTab;
        window.switchTab(targetTab, { restore: true, skipState: true, noScroll: true });
        const restoredFromDomCache = window.restoreCachedDomState?.(role, targetTab);
        if (!restoredFromDomCache && appStaticDataReady) {
            window.restoreAppState(role);
        }
        if (!restoredFromDomCache && targetTab === "dashboard") {
            window.backToDashboardMain?.();
            window.loadDashboardData?.();
        } else if (targetTab === "dashboard" && role === "teacher") {
            window.backToDashboardMain?.();
        }
    }

    window.updateBackButtonVisibility?.();
    if (loader) loader.style.display = "none";
    if (role === "admin") {
        setTimeout(() => {
            window.ensureStudentSearchIndex?.().catch(error => {
                console.error("Khong the khoi tao chi muc tim hoc sinh:", error);
            });
        }, 0);
    }
};

window.bootstrapCachedSession = function () {
    if (window.hasValidTeacherSession()) {
        window.showAuthenticatedApp("teacher", "nhap-lieu");
        return true;
    }
    return false;
};

window.restoreAppState = async function (role = window.currentRole) {
    if (isRestoringAppState) return;

    const savedState = window.getSavedAppState();
    const persistedDraft = role === "teacher" ? window.getTeacherWorkingDraft?.() : null;
    if ((!savedState || savedState.role !== role) && !persistedDraft) return;

    const state = savedState && savedState.role === role
        ? savedState
        : { role, teacher: {}, review: {}, scrollY: 0, wizardStep: "" };

    isRestoringAppState = true;
    try {
        if (role === "teacher") {
            const storedTeacherState = state.teacher || {};
            const stateDraft = !persistedDraft && Array.isArray(storedTeacherState.draftCards)
                ? {
                    version: TEACHER_WORKING_DRAFT_VERSION,
                    savedAt: state.savedAt || Date.now(),
                    context: {
                        facility: storedTeacherState.facility || "",
                        khoi: storedTeacherState.khoi || "",
                        lop: storedTeacherState.lop || "",
                        schedule: storedTeacherState.schedule || "",
                        ngayDay: storedTeacherState.ngayDay || "",
                        teacherName: storedTeacherState.teacherName || "",
                        lessonInstanceId: storedTeacherState.lessonInstanceId || ""
                    },
                    cards: storedTeacherState.draftCards,
                    globalContent: storedTeacherState.globalContent || "",
                    searchText: storedTeacherState.searchText || "",
                    reportContent: storedTeacherState.reportContent || "",
                    tempCache: storedTeacherState.tempCache || {}
                }
                : null;
            const teacherDraft = persistedDraft || stateDraft;
            const teacherState = {
                ...storedTeacherState,
                ...(teacherDraft?.context || {})
            };
            const facInput = document.getElementById("select-facility-gv");
            if (facInput && teacherState.facility) facInput.value = teacherState.facility;
            window.setActiveButtonByText("ui-facility-nhap-lieu", teacherState.facility);

            if (teacherState.facility && window.facilityCategoriesMap) {
                const categories = (window.facilityCategoriesMap[teacherState.facility] || []).slice().sort();
                window.renderKhoiUI?.("ui-khoi-gv", "select-khoi-gv", "select-lop-gv", categories);
                const stepKhoi = document.getElementById("step-1-khoi-nl");
                if (stepKhoi) stepKhoi.style.display = "block";
            }

            const khoiInput = document.getElementById("select-khoi-gv");
            if (khoiInput && teacherState.khoi) khoiInput.value = teacherState.khoi;
            window.setActiveButtonByText("ui-khoi-gv", teacherState.khoi);

            if (teacherState.khoi && typeof window.handleSelectKhoi === "function") {
                await window.handleSelectKhoi(null, teacherState.khoi, "select-khoi-gv", "ui-khoi-gv", "select-lop-gv");
            }

            const lopInput = document.getElementById("select-lop-gv");
            if (lopInput && teacherState.lop) lopInput.value = teacherState.lop;
            const scheduleInput = document.getElementById("select-schedule-gv");
            if (scheduleInput && teacherState.schedule) scheduleInput.value = teacherState.schedule;
            const dateInput = document.getElementById("ngayDay");
            if (dateInput && teacherState.ngayDay) dateInput.value = teacherState.ngayDay;
            const teacherNameInput = document.getElementById("tenGV");
            if (teacherNameInput) teacherNameInput.value = teacherState.teacherName || teacherNameInput.value || "";
            const globalContentInput = document.getElementById("global-nd-input");
            if (globalContentInput) globalContentInput.value = teacherDraft?.globalContent || teacherState.globalContent || "";
            const searchInput = document.getElementById("inlineSearchInput");
            if (searchInput) searchInput.value = teacherDraft?.searchText || teacherState.searchText || "";
            const reportInput = document.getElementById("global-report-content");
            if (reportInput) reportInput.value = teacherDraft?.reportContent || teacherState.reportContent || "";
            const restoredTempCache = teacherDraft?.tempCache || teacherState.tempCache;
            if (restoredTempCache && typeof restoredTempCache === "object") {
                window.tempCache = JSON.parse(JSON.stringify(restoredTempCache));
            }

            if (teacherState.lop && typeof window.loadSchedulesForClass === "function") {
                await window.loadSchedulesForClass({
                    selectedSchedule: teacherState.schedule || "",
                    preserveDraft: true
                });
            } else if (teacherState.lop && typeof window.renderNhapLieu === "function") {
                await window.renderNhapLieu({ preserveDraft: true });
            }

            if (teacherDraft) {
                window.applyTeacherWorkingDraft?.(teacherDraft);
            } else if (Array.isArray(teacherState.selectedStudents)) {
                teacherState.selectedStudents.forEach(name => window.addStudentCard?.(name));
            }

            if (state.wizardStep) document.body.setAttribute("data-wizard-step", teacherState.lop ? "3" : state.wizardStep);
        }

        const review = state.review || {};
        if (typeof window.rehydrateReviewFilters === "function") {
            await window.rehydrateReviewFilters(review);
        } else {
            ["filter-facility", "filter-khoi", "filter-lop", "global-hs-search-input"].forEach(id => {
                const el = document.getElementById(id);
                const key = id === "filter-facility" ? "facility" : id === "filter-khoi" ? "khoi" : id === "filter-lop" ? "lop" : "studentSearch";
                if (el && review[key]) el.value = review[key];
            });
        }

        if (Number.isFinite(Number(state.scrollY))) {
            requestAnimationFrame(() => window.scrollTo(0, Number(state.scrollY || 0)));
        }
    } finally {
        isRestoringAppState = false;
    }
};

window.resetStaleFinalSaveState = (force = false) => {
    if (!window.uiAsyncState.isSubmittingFinal) return false;
    const startedAt = Number(window.uiAsyncState.finalSaveStartedAt || 0);
    if (!force && startedAt && Date.now() - startedAt < 30000) return false;

    window.uiAsyncState.isSubmittingFinal = false;
    window.uiAsyncState.finalSaveStartedAt = 0;
    clearTimeout(finalSaveUnlockTimer);
    finalSaveUnlockTimer = null;

    const saveButton = document.querySelector('button[onclick="window.saveFinal()"]');
    if (saveButton) {
        saveButton.disabled = false;
        saveButton.innerHTML = saveButton.dataset.defaultLabel || saveButton.innerHTML;
    }
    window.persistTeacherWorkingDraft?.();
    window.showToast?.("Kết nối lưu bị gián đoạn. Dữ liệu vẫn được giữ, vui lòng bấm lưu lại.", "warning");
    return true;
};

window.recoverActiveViewAfterResume = () => {
    window.resetStaleFinalSaveState?.();
    const activeTab = document.querySelector(".page-section.active")?.id || "";

    if (activeTab === "quan-ly") {
        window.rehydrateReviewFilters?.();
    }

    if (activeTab === "du-lieu") {
        window.openDataCenter?.();
    }

    if (activeTab === "nhap-lieu") {
        if (isRestoringAppState || window.uiAsyncState.isLoadingStudents) return resumeRecoveryPromise;
        window.syncNhapLieuFormState?.();
        const lop = document.getElementById("select-lop-gv")?.value || "";
        const area = document.getElementById("area-cards");
        const draft = window.getTeacherWorkingDraft?.();
        const hasContent = !!area && area.children.length > 0;
        const hasCards = !!area?.querySelector(".student-card");
        const lostDraftCards = Array.isArray(draft?.cards) && draft.cards.length > 0 && !hasCards;
        const stuckLoading = !!area?.querySelector("#loading-card-msg") && !window.uiAsyncState.isLoadingStudents;
        if (lop && (!hasContent || stuckLoading || lostDraftCards)) {
            if (!resumeRecoveryPromise) {
                resumeRecoveryPromise = (async () => {
                    await window.loadSchedulesForClass?.({
                        selectedSchedule: document.getElementById("select-schedule-gv")?.value || draft?.context?.schedule || "",
                        preserveDraft: true
                    });
                    if (draft) window.applyTeacherWorkingDraft?.(draft);
                })().catch(error => {
                    console.error("Khong the khoi phuc ban nhap sau khi quay lai app:", error);
                }).finally(() => {
                    resumeRecoveryPromise = null;
                });
            }
            return resumeRecoveryPromise;
        }
    }
    return null;
};

window.initAppStateListeners = () => {
    document.addEventListener("change", (event) => {
        const id = event.target?.id || "";
        if (!isRestoringAppState && ["select-lop-gv", "select-schedule-gv", "ngayDay"].includes(id)) {
            window.clearGeneratedReport?.();
        }
        if (["select-lop-gv", "select-schedule-gv", "ngayDay", "filter-facility", "filter-khoi", "filter-lop"].includes(id)) {
            window.scheduleSaveAppState();
        }
    });

    document.addEventListener("input", (event) => {
        const id = event.target?.id || "";
        if (!isRestoringAppState && ["tenGV", "global-nd-input"].includes(id)) {
            window.clearGeneratedReport?.();
        }
        if (["tenGV", "global-hs-search-input", "inlineSearchInput", "global-nd-input"].includes(id)) {
            window.scheduleSaveAppState();
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") window.saveAppState();
        else window.recoverActiveViewAfterResume?.();
    });

    window.addEventListener("pagehide", () => window.saveAppState());
    document.addEventListener("freeze", () => window.saveAppState());
    window.addEventListener("pageshow", (event) => {
        const loader = document.getElementById("global-loader");
        if (loader) loader.style.display = "none";
        window.recoverActiveViewAfterResume?.();
    });
};

window.updateStudentIndices = () => {
    const cards = document.querySelectorAll('#area-cards .student-card');
    cards.forEach((card, index) => {
        const name = card.getAttribute('data-name');
        const titleEl = card.querySelector('.student-name-title');
        if (titleEl) {
            let school = window.studentSchoolMap[name] || "";
            let schoolHtml = school ? ` <span class="school-text">( ${school} )</span>` : "";
            titleEl.innerHTML = `${index + 1}. <span class="text-dark hs-display-name">${name}</span>${schoolHtml}`; // THÊM CLASS hs-display-name để tiện tìm kiếm sau này
        }
    });
};

const pastelColors = [
    { bg: "#f4fdf8", text: "#16a34a" },
    { bg: "#f4f9ff", text: "#2563eb" },
    { bg: "#fffcf5", text: "#ea580c" },
    { bg: "#fff5f7", text: "#db2777" },
    { bg: "#f7f7ff", text: "#6366f1" },
    { bg: "#fdf8f5", text: "#9a3412" }
];

window.categoryColorMap = {};
window.classCategoryMap = {};

/* ==========================================
   1. ĐIỀU HƯỚNG VÀ GIAO DIỆN (UI)
========================================== */
window.switchTab = function (tabId, options = {}) {
    document.querySelectorAll('.page-section').forEach(page => {
        if (page) page.style.display = 'none';
        if (page) page.classList.remove('active');
    });

    const activePage = document.getElementById(tabId);
    if (activePage) {
        activePage.style.display = 'block';
        activePage.classList.add('active');
    }

    document.querySelectorAll('.sidebar .btn-tab').forEach(item => item.classList.remove('active'));
    const activeTabBtn = document.getElementById('tab-' + tabId);
    if (activeTabBtn) activeTabBtn.classList.add('active');

    document.querySelectorAll('.bottom-nav-mobile .nav-item').forEach(item => item.classList.remove('active'));
    const activeMobileNav = document.getElementById('bot-tab-' + tabId);
    if (activeMobileNav) activeMobileNav.classList.add('active');

    if (tabId === 'dashboard' && !options.restore) {
        // TÍCH HỢP CODE: Hiện lại Bảng tin nếu đang ở trang chủ
        window.backToDashboardMain();
        window.loadDashboardData();
    }

    if (tabId === 'nhap-lieu' && !options.restore) {
        const step1 = document.getElementById('step-1-khoi-nl');
        if (step1) step1.style.display = 'none';

        const step2 = document.getElementById('step-2-lop-nl');
        if (step2) step2.style.display = 'none';

        const step3Form = document.getElementById('step-3-form-nl');
        if (step3Form) {
            step3Form.style.display = 'none';
            step3Form.classList.remove('mobile-show-form');
        }
        document.querySelectorAll('.btn-pill').forEach(pill => pill.classList.remove('active'));
        const facGv = document.getElementById('select-facility-gv');
        if (facGv) facGv.value = '';
    }

    if (tabId === 'quan-ly' && !options.restore) {
        const a2ResultArea = document.getElementById('a2-result-area');
        if (a2ResultArea) {
            a2ResultArea.style.display = 'none';
            delete a2ResultArea.dataset.returnContext;
        }

        const areaSoA2 = document.getElementById('area-so-a2');
        if (areaSoA2) areaSoA2.innerHTML = "";

        const searchArea = document.getElementById('a2-search-area');
        if (searchArea) searchArea.style.display = 'block';

        const filterArea = document.getElementById('a2-filter-area');
        if (filterArea) filterArea.style.display = 'block';
    }

    if (tabId === 'du-lieu') {
        window.openDataCenter?.();
    }

    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.classList.contains('collapsed')) {
            sidebar.classList.add('collapsed');
        }
    }
    if (!options.noScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
    window.updateBackButtonVisibility?.();
    if (!options.skipState) window.scheduleSaveAppState?.();
};

window.updateBackButtonVisibility = () => {
    const btn = document.querySelector('.mobile-header .btn-glass-back');
    if (!btn) return;

    let currentTab = "";
    document.querySelectorAll('.page-section').forEach(sec => {
        if (sec.classList.contains('active')) currentTab = sec.id;
    });

    const wizardStep = parseInt(document.body.getAttribute('data-wizard-step') || '1', 10);
    const isNhapLieuSubStep = currentTab === 'nhap-lieu' && wizardStep > 1;
    const isViewingEvaluation = currentTab === 'quan-ly' && document.getElementById('a2-result-area')?.style.display === 'block';
    const isAdminSubPanel = currentTab === 'dashboard' && document.getElementById('admin-management-panels')?.style.display === 'block';

    btn.classList.toggle('is-visible', !!(isNhapLieuSubStep || isViewingEvaluation || isAdminSubPanel));
};

window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    const content = document.getElementById('content-wrapper');
    if (sidebar) sidebar.classList.toggle('collapsed');
    if (content) content.classList.toggle('collapsed');
};

window.closeModalByClickOutside = (event) => {
    if (event.target.classList.contains('custom-modal-overlay') || event.target.id === 'custom-modal-overlay') {
        window.closeModal();
    }
};

window.closeModalOutside = (event, modalId) => {
    if (event.target.classList.contains('modal-overlay') || event.target.id === modalId) {
        document.getElementById(modalId).style.display = 'none';
    }
};

window.showModal = (msg, type = 'info', callback = null, defaultValue = '', options = {}) => {
    const overlay = document.getElementById('custom-modal-overlay');
    const msgEl = document.getElementById('modal-msg');
    const inputEl = document.getElementById('modal-input-note');
    const actionsEl = document.getElementById('modal-actions');

    if (!overlay || !msgEl || !inputEl || !actionsEl) return;
    let textareaEl = document.getElementById('modal-textarea-note');
    if (!textareaEl) {
        textareaEl = document.createElement('textarea');
        textareaEl.id = 'modal-textarea-note';
        textareaEl.className = 'form-control mb-4 modal-prompt-input modal-prompt-textarea';
        textareaEl.setAttribute('autocomplete', 'off');
        inputEl.insertAdjacentElement('afterend', textareaEl);
    }

    msgEl.innerHTML = msg;
    actionsEl.innerHTML = '';
    inputEl.style.display = 'none';
    inputEl.value = '';
    inputEl.type = 'text';
    inputEl.placeholder = options.placeholder || 'Nh\u1eadp n\u1ed9i dung...';
    textareaEl.style.display = 'none';
    textareaEl.value = '';
    textareaEl.placeholder = options.placeholder || 'M\u1ed7i d\u00f2ng l\u00e0 1 m\u1ee5c...';

    if (type === 'success') {
        setTimeout(window.closeModal, 1500);
    }
    else if (type === 'error') {
        setTimeout(window.closeModal, 3000);
    }
    else if (type === 'confirm') {
        actionsEl.innerHTML = `<button class="btn-modal btn-modal-cancel" onclick="window.closeModal()">Hủy</button><button type="button" class="btn-modal btn-modal-confirm" id="btn-confirm-action">Đồng ý</button>`;
        document.getElementById('btn-confirm-action').onclick = () => {
            window.closeModal();
            if (callback) callback();
        };
    }
    else if (type === 'prompt' || type === 'prompt-date') {
        inputEl.type = type === 'prompt-date' ? 'date' : 'text';
        inputEl.style.display = 'block';
        inputEl.value = defaultValue;
        actionsEl.innerHTML = `<button class="btn-modal btn-modal-cancel" onclick="window.closeModal()">Hủy</button><button type="button" class="btn-modal btn-modal-confirm" id="btn-confirm-action">Tiếp tục</button>`;
        document.getElementById('btn-confirm-action').onclick = () => {
            const val = inputEl.value.trim();
            window.closeModal();
            if (callback) callback(val);
        };
    }
    else if (type === 'prompt-multiline') {
        textareaEl.style.display = 'block';
        textareaEl.value = defaultValue;
        actionsEl.innerHTML = `<button class="btn-modal btn-modal-cancel" onclick="window.closeModal()">H\u1ee7y</button><button type="button" class="btn-modal btn-modal-confirm" id="btn-confirm-action">Ti\u1ebfp t\u1ee5c</button>`;
        document.getElementById('btn-confirm-action').onclick = () => {
            const val = textareaEl.value.trim();
            window.closeModal();
            if (callback) callback(val);
        };
    }
    else if (type === 'prompt-note') {
        inputEl.type = 'text';
        inputEl.style.display = 'block';
        inputEl.value = defaultValue;
        actionsEl.innerHTML = `<button type="button" class="btn-modal btn-modal-cancel" onclick="window.closeModal()">Hủy</button><button type="button" class="btn-modal btn-modal-confirm" id="btn-save-note">Lưu</button>`;
        document.getElementById('btn-save-note').onclick = async () => {
            const val = inputEl.value.trim();
            const saveBtn = document.getElementById('btn-save-note');
            saveBtn.disabled = true;
            const prevLabel = saveBtn.textContent;
            saveBtn.textContent = 'Đang lưu...';
            try {
                if (callback) await Promise.resolve(callback(val));
                window.closeModal();
                window.showModal('Đã lưu ghi chú', 'success');
            } catch (err) {
                console.error(err);
                window.showModal('Không lưu được ghi chú: ' + (err.message || ''), 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = prevLabel;
            }
        };
    }

    overlay.classList.add('active');
    if (type === 'prompt' || type === 'prompt-date' || type === 'prompt-note') inputEl.focus();
    if (type === 'prompt-multiline') textareaEl.focus();
};

window.closeModal = () => {
    const overlay = document.getElementById('custom-modal-overlay');
    if (overlay) overlay.classList.remove('active');
};

// TÍCH HỢP CODE: Hàm Chuyển trang Quản lý Admin hoàn toàn cách ly Bảng Tin
window.openAdminSection = function (sectionId) {
    try {
        document.getElementById('dashboard-main-content').style.display = 'none';
        document.getElementById('admin-management-panels').style.display = 'block';
        const sections = ['sec-facility', 'sec-khoi', 'sec-lop', 'sec-gv', 'sec-system-list'];
        sections.forEach(sec => {
            let el = document.getElementById(sec);
            if (el) el.style.display = 'none';
        });
        document.getElementById(sectionId).style.display = 'block';

        document.dispatchEvent(new CustomEvent('spt:admin-teacher-directory'));
        if (sectionId === 'sec-gv') window.loadTeachersList();
        if (sectionId === 'sec-facility') window.renderAdminFacilities?.();
        window.updateBackButtonVisibility?.();
    } catch (error) {
        console.error('[openAdminSection] UI error:', error);
    }
};

window.backToDashboardMain = function () {
    try {
        let dashMain = document.getElementById('dashboard-main-content');
        let adminPanels = document.getElementById('admin-management-panels');
        if (dashMain) dashMain.style.display = 'block';
        if (adminPanels) adminPanels.style.display = 'none';
        const systemListPage = document.getElementById('sec-system-list');
        if (systemListPage) systemListPage.style.display = 'none';
        window.updateBackButtonVisibility?.();
    } catch (error) {
        console.error('[backToDashboardMain] UI error:', error);
    }
};

// TÍCH HỢP CODE: Hàm Nút Quay Lại (Top Nav Mobile)
window.handleMobileBack = function () {
    let currentTab = '';
    document.querySelectorAll('.page-section').forEach(sec => {
        if (sec.classList.contains('active')) currentTab = sec.id;
    });

    // Đang nhập liệu
    if (currentTab === 'nhap-lieu') {
        let step = parseInt(document.body.getAttribute('data-wizard-step') || '1');
        if (step > 1) {
            window.wizardBack();
            window.updateBackButtonVisibility?.();
            return;
        }
    }

    // Đang mở Xem phiếu kết quả chi tiết
    if (currentTab === 'quan-ly' && document.getElementById('a2-result-area').style.display === 'block') {
        const resultArea = document.getElementById('a2-result-area');
        if (resultArea.dataset.returnContext === 'teacher-class') {
            delete resultArea.dataset.returnContext;
            document.dispatchEvent(new CustomEvent('spt:return-to-teacher-class'));
            return;
        }
        resultArea.style.display = 'none';
        document.getElementById('a2-search-area').style.display = 'block';
        document.getElementById('a2-filter-area').style.display = 'block';
        window.updateBackButtonVisibility?.();
        return;
    }

    // Đang mở Form quản lý Admin (Thêm HS, Cơ sở...)
    if (currentTab === 'dashboard' && document.getElementById('admin-management-panels').style.display === 'block') {
        const managementBack = document.getElementById('admin-management-back');
        if (managementBack) managementBack.click();
        else window.backToDashboardMain();
        window.updateBackButtonVisibility?.();
        return;
    }

    // Mặc định lùi về trang chủ
    // Teachers only have two main tabs. Once a tab is at its root screen,
    // stop here instead of falling through to the admin dashboard/newsfeed.
    if (window.currentRole === 'teacher') {
        return;
    }

    window.switchTab('dashboard');
};

window.goToFacility = (facName) => {
    window.switchTab('nhap-lieu');
    setTimeout(() => {
        const pills = document.querySelectorAll('#ui-facility-nhap-lieu .btn-pill');
        for (let pill of pills) {
            if (pill.innerText.trim().toUpperCase() === facName.toUpperCase()) {
                pill.click();
                setTimeout(() => {
                    const khoiArea = document.getElementById('step-1-khoi-nl');
                    if (khoiArea) {
                        khoiArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 300);
                break;
            }
        }
    }, 200);
};

/* ==========================================
   2. AUTHENTICATION (GIỮ NGUYÊN FIREBASE)
========================================== */
window.selectRole = function (role) {
    if (role === 'teacher') {
        window.setTeacherSession();
        window.showAuthenticatedApp('teacher', 'nhap-lieu');
    }
};

window.hideAdminLoginScreen = () => {
    const aBlock = document.getElementById('admin-login-screen');
    if (aBlock) aBlock.style.display = 'none';
};

window.showAdminLoginScreen = () => {
    const aBlock = document.getElementById('admin-login-screen');
    if (aBlock) aBlock.style.display = 'flex';
    document.getElementById('admin-login-error').style.display = 'none';
    setTimeout(() => { document.getElementById('admin-login-email')?.focus(); }, 100);
};

// TÍCH HỢP BÁO LỖI: Login Admin (Firebase)
window.customLoginAdmin = async () => {
    const email = document.getElementById('admin-login-email')?.value.trim();
    const password = document.getElementById('admin-login-password')?.value.trim();
    const errorMsg = document.getElementById('admin-login-error');
    const btnSubmit = document.getElementById('admin-login-submit-btn');

    if (errorMsg) errorMsg.style.display = 'none';

    if (!email || !password) {
        if (errorMsg) {
            errorMsg.innerText = "Vui lòng nhập đầy đủ Email và Mật khẩu!";
            errorMsg.style.display = 'block';
        }
        return;
    }

    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Đang xử lý...';
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);

        window.showAuthenticatedApp('admin', 'dashboard');

        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = 'Đăng Nhập';
        }
    } catch (error) {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = 'Đăng Nhập';
        }

        if (errorMsg) {
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                errorMsg.innerText = "Sai mật khẩu Quản lý, vui lòng thử lại!";
            } else if (error.code === 'auth/user-not-found') {
                errorMsg.innerText = "Tài khoản Quản lý không tồn tại!";
            } else {
                errorMsg.innerText = "Đăng nhập thất bại: " + error.message;
            }
            errorMsg.style.display = 'block';
        } else {
            window.showModal("Lỗi đăng nhập: " + error.message, "error");
        }
    }
};

window.loginAdmin = window.customLoginAdmin; // Trỏ hàm để lỡ button HTML gọi nhầm thì vẫn đúng logic

window.applyRolePermissions = function () {
    const dashboardMenu = document.getElementById('tab-dashboard');
    const dashboardMenuMobile = document.getElementById('bot-tab-dashboard');
    const roleBadge = document.querySelector('.user-role-badge');

    // Cập nhật class trên thẻ body để phục vụ phân quyền CSS
    document.body.classList.remove('role-giaovien', 'role-quanly');

    if (window.currentRole === 'teacher') {
        document.body.classList.add('role-giaovien');

        if (dashboardMenu) dashboardMenu.style.display = 'none';
        if (dashboardMenuMobile) dashboardMenuMobile.style.display = 'none';

        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.admin-only-flex').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.admin-only-block').forEach(el => el.style.display = 'none');

        if (roleBadge) {
            roleBadge.className = 'user-role-badge badge-teacher';
            roleBadge.innerHTML = '<i class="fas fa-chalkboard-teacher"></i> <span class="role-text">Giáo viên</span>';
            roleBadge.onclick = null;
            roleBadge.title = "";
            roleBadge.style.cursor = 'default';
        }
    } else {
        document.body.classList.add('role-quanly');

        if (dashboardMenu) dashboardMenu.style.display = 'block';
        if (dashboardMenuMobile) dashboardMenuMobile.style.display = 'flex';

        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'inline-block');
        document.querySelectorAll('.admin-only-flex').forEach(el => el.style.display = 'flex');
        document.querySelectorAll('.admin-only-block').forEach(el => {
            if (el.dataset.viewManaged === 'true') return;
            el.style.display = 'block';
        });

        if (roleBadge) {
            roleBadge.className = 'user-role-badge badge-admin admin-only-flex';
            roleBadge.innerHTML = '<i class="fas fa-user-shield"></i> <span class="role-text">Quản lý</span>';
            roleBadge.onclick = () => window.switchTab('tai-khoan');
            roleBadge.title = "Click để đổi mật khẩu";
        }
    }
};

window.changeAdminPassword = async () => {
    const currentPwd = document.getElementById('current-pwd').value.trim();
    const newEmail = document.getElementById('new-username')?.value.trim();
    const newPwd = document.getElementById('new-pwd').value.trim();
    const confirmPwd = document.getElementById('confirm-new-pwd').value.trim();
    const btn = document.getElementById('btn-change-pwd');

    if (!currentPwd) return window.showModal("Vui lòng nhập mật khẩu hiện tại để xác thực!", "error");
    if (newPwd && newPwd !== confirmPwd) return window.showModal("Mật khẩu mới không khớp!", "error");
    if (newPwd && newPwd.length < 6) return window.showModal("Mật khẩu mới phải có ít nhất 6 ký tự!", "error");
    if (!newEmail && !newPwd) return window.showModal("Vui lòng nhập Tên đăng nhập mới hoặc Mật khẩu mới!", "error");

    const user = auth.currentUser;
    if (!user) return window.showModal("Lỗi: Không tìm thấy phiên đăng nhập!", "error");

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>ĐANG XỬ LÝ...';

    try {
        const credential = EmailAuthProvider.credential(user.email, currentPwd);
        await reauthenticateWithCredential(user, credential);

        if (newEmail && newEmail !== user.email) {
            await updateEmail(user, newEmail);
        }

        if (newPwd) {
            await updatePassword(user, newPwd);
        }

        window.showModal("Cập nhật tài khoản thành công! Hệ thống sẽ tự động đăng xuất.", "success");

        setTimeout(() => {
            window.handleLogout();
        }, 2000);

    } catch (error) {
        console.error("Lỗi đổi mật khẩu/email:", error);
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            window.showModal("Mật khẩu hiện tại không đúng!", "error");
        } else if (error.code === 'auth/email-already-in-use') {
            window.showModal("Tên đăng nhập / Email này đã được sử dụng!", "error");
        } else {
            window.showModal("Lỗi hệ thống: " + error.message, "error");
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'CẬP NHẬT THAY ĐỔI';
    }
};

onAuthStateChanged(auth, (user) => {
    const loader = document.getElementById('global-loader');
    const roleScreen = document.getElementById('roleSelectionScreen');
    const mainApp = document.getElementById('mainApp');

    if (user) {
        window.showAuthenticatedApp('admin', 'dashboard');
    } else {
        if (window.hasValidTeacherSession()) {
            window.showAuthenticatedApp('teacher', 'nhap-lieu');
        } else {
            if (loader) loader.style.display = 'none';
            if (roleScreen) roleScreen.style.display = 'flex';
            if (mainApp) mainApp.style.display = 'none';
        }
    }
});

// TÍCH HỢP CODE: Menu Đăng Xuất Mobile (Ẩn mờ)
window.showMobileLogoutMenu = function () {
    document.getElementById('mobile-logout-overlay').style.display = 'block';
    document.getElementById('mobile-logout-menu').style.display = 'flex';
};
window.hideMobileLogoutMenu = function () {
    document.getElementById('mobile-logout-overlay').style.display = 'none';
    document.getElementById('mobile-logout-menu').style.display = 'none';
};

window.handleLogout = function () {
    window.stopDashboardRecordsRealtime?.();
    window.currentRole = '';
    localStorage.removeItem('userRole');
    localStorage.removeItem(TEACHER_SESSION_KEY);
    window.clearSavedAppState();
    window.clearAppDomCache();
    window.clearPersistedTeacherWorkingDraft?.();
    sessionStorage.clear();

    window.hideMobileLogoutMenu();

    if (typeof auth !== 'undefined' && auth) {
        signOut(auth).then(() => { window.location.reload(); }).catch(() => { window.location.reload(); });
    } else {
        window.location.reload();
    }
};

/* ==========================================
   3. DATA FETCHING (LẤY DỮ LIỆU TỪ FIREBASE GIỮ NGUYÊN)
========================================== */
window.getCachedStaticDataPayload = (options = {}) => {
    const cache = options.allowStale
        ? window.getStaleJsonCache(APP_STATIC_DATA_CACHE_KEY)
        : window.getJsonCache(APP_STATIC_DATA_CACHE_KEY, APP_STATIC_DATA_CACHE_DURATION_MS);
    return cache?.payload || null;
};

window.applyStaticDataPayload = (payload = {}) => {
    window.allFacilities = Array.isArray(payload.allFacilities)
        ? [...new Set(payload.allFacilities.filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"))
        : [];
    window.allCategories = Array.isArray(payload.allCategories)
        ? [...new Set(payload.allCategories.filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"))
        : [];
    window.facilityCategoriesMap = payload.facilityCategoriesMap && typeof payload.facilityCategoriesMap === "object"
        ? { ...payload.facilityCategoriesMap }
        : {};
    window.categoryPrefixByFacilityCategory = payload.categoryPrefixByFacilityCategory
        && typeof payload.categoryPrefixByFacilityCategory === "object"
        ? { ...payload.categoryPrefixByFacilityCategory }
        : {};
};

window.renderStaticDataUi = () => {
    if (!(fastDomCacheRestored && fastDomCacheRestoredTab === "nhap-lieu")) {
        renderFacilityUI('ui-facility-nhap-lieu', 'select-facility-gv', 'ui-khoi-gv');
        window.setActiveButtonByText?.("ui-facility-nhap-lieu", document.getElementById("select-facility-gv")?.value || "");
    }
    renderFacilityUI('ui-facility-tao-khoi', 'select-facility-tao-khoi', null);
    renderFacilityUI('ui-facility-tao', 'select-facility-tao-lop', 'ui-khoi-tao');

    const filterFac = document.getElementById('filter-facility');
    if (filterFac) window.setSelectOptions(filterFac, "-- Chọn Cơ sở --", window.allFacilities, filterFac.value);

    const filterLop = document.getElementById('filter-lop');
    if (filterLop && !filterLop.dataset.reviewInvalidatorBound) {
        filterLop.dataset.reviewInvalidatorBound = "1";
        filterLop.addEventListener('change', () => {
            window.uiAsyncState.reviewFilterRequestId += 1;
        });
    }

    const systemListFacSelect = document.getElementById('systemListFacSelect');
    if (systemListFacSelect) {
        window.setSelectOptions(systemListFacSelect, "-- Chọn Cơ sở --", window.allFacilities, systemListFacSelect.value);
    }

    const ngayDayEl = document.getElementById('ngayDay');
    if (ngayDayEl && !ngayDayEl.value) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        ngayDayEl.value = `${yyyy}-${mm}-${dd}`;
    }
};

window.renderStaticDataLoadError = () => {
    const container = document.getElementById("ui-facility-nhap-lieu");
    if (!container || window.allFacilities.length > 0) return;
    container.innerHTML = `<div class="review-load-error" role="alert">
        <span>Chưa tải được danh sách cơ sở.</span>
        <button type="button" class="btn btn-sm btn-outline-success" onclick="window.retryInitialStaticData()">Thử tải lại</button>
    </div>`;
};

async function init() {
    let restoreStarted = false;
    const restoreAvailableState = async () => {
        if (restoreStarted || !window.currentRole || (fastDomCacheRestored && fastDomCacheRestoredTab !== "nhap-lieu")) return;
        restoreStarted = true;
        await window.restoreAppState(window.currentRole);
    };

    const cachedPayload = window.getCachedStaticDataPayload({ allowStale: true });
    if (cachedPayload) {
        window.applyStaticDataPayload(cachedPayload);
        window.renderStaticDataUi();
        appStaticDataReady = true;
    }

    const restorePromise = cachedPayload ? restoreAvailableState() : Promise.resolve();
    try {
        const [snapFac, snapCat] = await window.measureUiRequest("spt:initial-static-data", () => window.withUiReadRetry(
            () => window.withUiTimeout(Promise.all([
                getDocs(collection(db, "facilities")),
                getDocs(collection(db, "categories"))
            ]), FIRESTORE_UI_QUERY_TIMEOUT_MS, "Tải dữ liệu khởi tạo quá thời gian")
        ));

        const payload = {
            allFacilities: snapFac.docs.map(item => item.data().name).filter(Boolean),
            allCategories: [],
            facilityCategoriesMap: {},
            categoryPrefixByFacilityCategory: {}
        };
        snapCat.forEach(item => {
            const data = item.data();
            if (data.name) payload.allCategories.push(data.name);
            if (data.facility && data.name) {
                if (!payload.facilityCategoriesMap[data.facility]) payload.facilityCategoriesMap[data.facility] = [];
                payload.facilityCategoriesMap[data.facility].push(data.name);
                payload.categoryPrefixByFacilityCategory[window.makeDataKey(data.facility, data.name)] = data.nxPrefix || "";
            }
        });

        window.applyStaticDataPayload(payload);
        window.saveJsonCache(APP_STATIC_DATA_CACHE_KEY, { payload });
        window.renderStaticDataUi();
        appStaticDataReady = true;
        await restoreAvailableState();
    } catch (error) {
        console.error("Lỗi nạp Dữ liệu tĩnh:", error);
        window.renderStaticDataLoadError();
    } finally {
        await restorePromise;
        window.loadTeachersList();
    }
}

window.retryInitialStaticData = () => {
    window.initPromise = init();
    return window.initPromise;
};

const renderFacilityUI = (containerId, inputId, targetKhoiId) => {
    try {
        let html = "";
        if (window.allFacilities.length === 0) html = "<i class='text-muted small'>Chưa có dữ liệu Cơ sở</i>";
        window.allFacilities.forEach((f, index) => {
            html += `<button type="button" class="btn-pill cs-${(index % 10) + 1}" onclick="window.handleSelectFacility(event, '${f}', '${inputId}', '${containerId}', '${targetKhoiId}')">
    <span class="tdt-wordart">TDT</span>
    <span class="cs-text">${f}</span>
</button>`;
        });
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = html;
    } catch (error) {
        console.error('[renderFacilityUI] Render error:', error);
    }
};

window.handleSelectFacility = async (event, facilityName, inputId, containerId, targetKhoiId) => {
    try {
        const inp = document.getElementById(inputId);
        if (inp) inp.value = facilityName;

        document.querySelectorAll(`#${containerId} .btn-pill`).forEach(b => b.classList.remove('active'));
        if (event && event.currentTarget) event.currentTarget.classList.add('active');
        window.uiAsyncState.facilityRequestId += 1;
        const currentFacilityRequestId = window.uiAsyncState.facilityRequestId;

        const khoiInputArea = document.getElementById('tao-khoi-input-area');
        if (containerId === 'ui-facility-tao-khoi' && khoiInputArea) {
            khoiInputArea.style.display = 'block';
        }

        if (targetKhoiId) {
            const khoiContainer = document.getElementById(targetKhoiId);
            if (khoiContainer) khoiContainer.innerHTML = "<i class='text-muted small'>Dang tai du lieu...</i>";
            if (targetKhoiId === 'ui-khoi-gv') window.resetTeacherClassData();
            let list = await window.getFacilityCategories(facilityName);
            if (currentFacilityRequestId !== window.uiAsyncState.facilityRequestId) return;

            if (targetKhoiId === 'ui-khoi-tao') {
                renderKhoiUI(targetKhoiId, 'select-khoi-tao-lop', 'tao-lop-step-2', list);
                const kArea = document.getElementById('tao-lop-khoi-area');
                if (kArea) kArea.style.display = 'block';
                const iArea = document.getElementById('tao-lop-input-area');
                if (iArea) iArea.style.display = 'none';
            }
            else if (targetKhoiId === 'ui-khoi-gv') {
                renderKhoiUI(targetKhoiId, 'select-khoi-gv', 'select-lop-gv', list);
                const s1 = document.getElementById('step-1-khoi-nl');
                if (s1) s1.style.display = 'block';

                // Tự động nhảy sang Step 2 (Chọn Khối) trong Wizard
                document.body.setAttribute('data-wizard-step', '2');
                window.updateBackButtonVisibility?.();

                const s2 = document.getElementById('step-2-lop-nl');
                if (s2) s2.style.display = 'none';

                const s3 = document.getElementById('step-3-form-nl');
                if (s3) {
                    s3.style.display = 'none';
                    s3.classList.remove('mobile-show-form');
                }

                const sk = document.getElementById('select-khoi-gv');
                if (sk) sk.value = '';

                const selectLop = document.getElementById('select-lop-gv');
                if (selectLop) selectLop.innerHTML = '<option value="">-- Chọn lớp --</option>';

                const sCont = document.getElementById('search-student-container');
                if (sCont) sCont.style.display = 'none';
                const aCards = document.getElementById('area-cards');
                if (aCards) aCards.innerHTML = '';
                const sFoot = document.getElementById('save-footer');
                if (sFoot) sFoot.style.display = 'none';
            }
        }
        window.scheduleSaveAppState?.();
    } catch (error) {
        console.error('[handleSelectFacility] UI error:', error);
        const khoiContainer = targetKhoiId ? document.getElementById(targetKhoiId) : null;
        if (khoiContainer) {
            khoiContainer.innerHTML = `<div class="review-load-error" role="alert">
                <span>Chưa tải được danh sách khối.</span>
                <button type="button" class="btn btn-sm btn-outline-warning" onclick="window.retryTeacherFacilityCategories()">Thử tải lại</button>
            </div>`;
        }
        window.showToast?.("Kết nối chậm, vui lòng chọn lại cơ sở.", "warning");
    }
};

window.retryTeacherFacilityCategories = () => {
    const facilityName = window.getCurrentTeacherFacility();
    if (!facilityName) return;
    return window.handleSelectFacility(null, facilityName, "select-facility-gv", "ui-facility-nhap-lieu", "ui-khoi-gv");
};

const renderKhoiUI = (containerId, inputId, targetLopId, list = null) => {
    try {
        let html = "";
        if (!list || list.length === 0) html = "<i class='text-muted small'>Chưa có dữ liệu khối</i>";
        else {
            list.forEach((c) => {
                html += `<button type="button" class="btn-khoi-box" onclick="window.handleSelectKhoi(event, '${c}', '${inputId}', '${containerId}', '${targetLopId}')">${c}</button>`;
            });
        }
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = html;
    } catch (error) {
        console.error('[renderKhoiUI] Render error:', error);
    }
};
window.renderKhoiUI = renderKhoiUI;

window.setTeacherClassLoadStatus = (status = "idle", message = "") => {
    window.uiAsyncState.classesStatus = status;
    const element = document.getElementById("teacher-class-load-status");
    if (!element) return;
    element.classList.toggle("is-error", status === "error");
    element.hidden = status === "idle" || status === "success" || !message;
    element.innerHTML = message;
};

window.showTeacherClassSelectionStep = () => {
    const form = document.getElementById('step-3-form-nl');
    if (form) {
        form.style.display = 'block';
        form.classList.add('mobile-show-form');
    }
    if (window.innerWidth <= 768) window.goToWizardStep?.(3);
};

window.retryTeacherClassOptions = () => {
    const khoiName = document.getElementById("select-khoi-gv")?.value || "";
    if (!khoiName) return;
    return window.handleSelectKhoi(null, khoiName, "select-khoi-gv", "ui-khoi-gv", "select-lop-gv");
};

window.handleSelectKhoi = async (event, khoiName, inputId, containerId, targetLopId) => {
    const inp = document.getElementById(inputId);
    if (inp) inp.value = khoiName;

    let container = document.getElementById(containerId);
    if (container) {
        container.querySelectorAll('.btn-khoi-box').forEach(b => b.classList.remove('active'));
    }
    if (event && event.target) event.target.classList.add('active');

    let facilityName = "";
    if (inputId === 'select-khoi-tao-lop') facilityName = document.getElementById('select-facility-tao-lop')?.value || "";
    else if (inputId === 'select-khoi-gv') facilityName = document.getElementById('select-facility-gv')?.value || "";
    window.scheduleSaveAppState?.();

    if (targetLopId) {
        if (targetLopId === 'select-lop-gv') {
            window.resetTeacherClassData();
            const select = document.getElementById('select-lop-gv');
            window.uiAsyncState.classRequestId += 1;
            const currentClassRequestId = window.uiAsyncState.classRequestId;
            window.uiAsyncState.isLoadingClasses = true;
            window.setTeacherClassLoadStatus("loading", "Đang tải danh sách lớp...");
            window.populateShiftSelect();

            const sCont = document.getElementById('search-student-container');
            if (sCont) sCont.style.display = 'none';
            const aCards = document.getElementById('area-cards');
            if (aCards) aCards.innerHTML = '';
            const sFoot = document.getElementById('save-footer');
            if (sFoot) sFoot.style.display = 'none';

            const cachedOptions = window.getCachedClassOptionsPayload(facilityName, khoiName, { allowStale: true });
            let renderedFromCache = false;
            if (cachedOptions && Array.isArray(cachedOptions.classes) && cachedOptions.classes.length > 0) {
                window.currentCommentPrefix = cachedOptions.nxPrefix || "";
                window.renderClassSelectOptions(select, cachedOptions.classes);
                renderedFromCache = true;
                if (select) select.disabled = false;
                window.setTeacherClassLoadStatus("success");
                window.showTeacherClassSelectionStep();
            } else {
                window.setSelectLoadingState(select, true, '-- Đang tải dữ liệu... --');
                window.currentCommentPrefix = "";
            }

            const classOptionsKey = window.makeDataKey(facilityName, khoiName);
            const fetchClassOptions = async () => {
                if (!window.uiAsyncState.classOptionsFetches) window.uiAsyncState.classOptionsFetches = {};
                if (!window.uiAsyncState.classOptionsFetches[classOptionsKey]) {
                    window.uiAsyncState.classOptionsFetches[classOptionsKey] = window.measureUiRequest(
                        "spt:class-options",
                        () => window.withUiReadRetry(() => window.withUiTimeout(Promise.all([
                            getDocs(query(collection(db, "categories"), where("name", "==", khoiName), where("facility", "==", facilityName))),
                            getDocs(query(collection(db, "classes"), where("category", "==", khoiName), where("facility", "==", facilityName)))
                        ]), FIRESTORE_UI_QUERY_TIMEOUT_MS, "Tải lớp quá thời gian"))
                    ).finally(() => {
                        delete window.uiAsyncState.classOptionsFetches[classOptionsKey];
                    });
                }
                return window.uiAsyncState.classOptionsFetches[classOptionsKey];
            };

            try {
                const [catSnap, classSnap] = await fetchClassOptions();
                if (currentClassRequestId !== window.uiAsyncState.classRequestId) return;
                if (facilityName !== window.getCurrentTeacherFacility() || khoiName !== document.getElementById(inputId)?.value) return;

                const nxPrefix = catSnap.empty ? "" : (catSnap.docs[0].data().nxPrefix || "");
                const classes = [...new Set(classSnap.docs
                    .map(d => d.data().name)
                    .filter(Boolean))]
                    .sort((a, b) => a.localeCompare(b, 'vi'));

                window.currentCommentPrefix = nxPrefix;
                window.classesByFacilityCategory[classOptionsKey] = classes.slice();
                window.categoryPrefixByFacilityCategory[classOptionsKey] = nxPrefix;
                window.saveCachedClassOptionsPayload(facilityName, khoiName, { classes, nxPrefix });
                const selectedClass = select?.value || "";
                window.renderClassSelectOptions(select, classes, classes.includes(selectedClass) ? selectedClass : "");
                if (classes.length > 0) {
                    window.setTeacherClassLoadStatus("success");
                    window.showTeacherClassSelectionStep();
                } else {
                    window.setTeacherClassLoadStatus("empty", "Khối này chưa có lớp nào trong hệ thống.");
                    if (window.innerWidth <= 768) window.goToWizardStep?.(2);
                }
            } catch (classErr) {
                if (currentClassRequestId === window.uiAsyncState.classRequestId && select && !renderedFromCache) {
                    window.setSelectOptions(select, "-- Chưa tải được danh sách lớp --", []);
                    window.setTeacherClassLoadStatus("error", `Chưa tải được danh sách lớp.<button type="button" class="btn btn-sm btn-outline-warning" onclick="window.retryTeacherClassOptions()">Thử tải lại</button>`);
                    if (window.innerWidth <= 768) window.goToWizardStep?.(2);
                } else if (renderedFromCache) {
                    window.setTeacherClassLoadStatus("success");
                    window.showToast?.("Đang dùng danh sách lớp đã lưu trên thiết bị.", "warning");
                }
                console.error("Lỗi tải lớp:", classErr);
            } finally {
                if (currentClassRequestId === window.uiAsyncState.classRequestId) {
                    window.uiAsyncState.isLoadingClasses = false;
                    if (select) select.disabled = false;
                }
            }

        }
        else if (targetLopId === 'tao-lop-step-2') {
            const tlArea = document.getElementById('tao-lop-input-area');
            if (tlArea) tlArea.style.display = 'block';
        }
    }
};

/* ==========================================
   4. CẤU HÌNH FORM TEMPLATE VÀ ADMIN QUẢN LÝ (DB FIREBASE)
========================================== */
window.openTemplateConfigModal = () => {
    const selectFac = document.getElementById('configFacSelect');
    if (selectFac) {
        selectFac.innerHTML = '<option value="">-- Chọn Cơ sở --</option>';
        window.allFacilities.forEach(f => selectFac.innerHTML += `<option value="${f}">${f}</option>`);
    }

    const kArea = document.getElementById('configKhoiArea');
    if (kArea) kArea.style.display = 'none';
    const iArea = document.getElementById('configInputsArea');
    if (iArea) iArea.style.display = 'none';
    const modal = document.getElementById('configTemplateModal');
    if (modal) modal.style.display = 'flex';
};

window.configFacChange = () => {
    const facSelect = document.getElementById('configFacSelect');
    const khoiSelect = document.getElementById('configKhoiSelect');
    const kArea = document.getElementById('configKhoiArea');
    const iArea = document.getElementById('configInputsArea');

    if (!facSelect || !facSelect.value) {
        if (kArea) kArea.style.display = 'none';
        if (iArea) iArea.style.display = 'none';
        return;
    }

    if (khoiSelect) {
        khoiSelect.innerHTML = '<option value="">-- Chọn Khối --</option>';
        let list = window.facilityCategoriesMap[facSelect.value] || [];
        list.sort();
        list.forEach(k => khoiSelect.innerHTML += `<option value="${k}">${k}</option>`);
    }

    if (kArea) kArea.style.display = 'block';
    if (iArea) iArea.style.display = 'none';
};

window.configKhoiChange = async () => {
    const facSelect = document.getElementById('configFacSelect');
    const khoiSelect = document.getElementById('configKhoiSelect');
    const inputsArea = document.getElementById('configInputsArea');
    const nxInput = document.getElementById('configPrefixNX');

    if (!facSelect || !khoiSelect || !khoiSelect.value) {
        if (inputsArea) inputsArea.style.display = 'none';
        return;
    }

    if (inputsArea) inputsArea.style.display = 'block';

    try {
        const q = query(collection(db, "categories"), where("name", "==", khoiSelect.value), where("facility", "==", facSelect.value));
        const snap = await getDocs(q);

        if (!snap.empty) {
            if (nxInput) nxInput.value = snap.docs[0].data().nxPrefix || "";
        } else {
            if (nxInput) nxInput.value = "";
        }
    } catch (error) {
        console.error("Lỗi tải cấu hình:", error);
        if (nxInput) nxInput.value = "";
    } finally {
        if (nxInput) nxInput.disabled = false;
    }
};

window.saveTemplateConfig = async (e) => {
    if (!auth || !auth.currentUser) { window.showToast('Lỗi: Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng tải lại trang!', 'error'); return; }
    e?.preventDefault?.();

    const facSelect = document.getElementById('configFacSelect');
    const khoiSelect = document.getElementById('configKhoiSelect');
    const nxInput = document.getElementById('configPrefixNX');
    const btn = document.querySelector('#configInputsArea button');
    const prevLabel = btn ? btn.innerHTML : '';

    if (!facSelect || !khoiSelect) return window.showModal("Lỗi giao diện, vui lòng F5 lại trang!", "error");

    const facName = facSelect.value;
    const khoiName = khoiSelect.value;
    const nx = nxInput ? nxInput.value : "";

    if (!facName || !khoiName) {
        window.showModal("Vui lòng chọn đủ Cơ sở và Khối!", "error");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Đang xử lý...';
    }

    try {
        const q = query(collection(db, "categories"), where("name", "==", khoiName), where("facility", "==", facName));
        const snap = await getDocs(q);

        if (!snap.empty) {
            const docRef = snap.docs[0].ref;
            await setDoc(docRef, { nxPrefix: nx }, { merge: true });
        } else {
            await addDoc(collection(db, "categories"), { name: khoiName, facility: facName, nxPrefix: nx });
        }

        window.categoryPrefixByFacilityCategory[window.makeDataKey(facName, khoiName)] = nx;
        window.invalidateClassOptionCaches?.();

        try {
            const modal = document.getElementById('configTemplateModal');
            if (modal) modal.style.display = 'none';
            window.closeModal?.();
        } catch (em) {
            console.error('[saveTemplateConfig] close modal error:', em);
        }

        if (nxInput) nxInput.value = "";

        window.showModal("Áp dụng cấu trúc thành công!", "success");
        window.showToast('Áp dụng cấu trúc thành công!', 'success');

        const currentFac = document.getElementById('select-facility-gv');
        const currentKhoi = document.getElementById('select-khoi-gv');

        if (currentFac && currentKhoi && currentFac.value === facName && currentKhoi.value === khoiName) {
            window.currentCommentPrefix = nx;
            const lopSelect = document.getElementById('select-lop-gv');
            if (lopSelect && lopSelect.value) {
                window.renderNhapLieu();
            }
        }
    } catch (error) {
        console.error(error);
        if (error.code === 'permission-denied') {
            window.showToast('Lỗi phân quyền: Dữ liệu bị từ chối. Hãy kiểm tra lại tài khoản.', 'error');
        } else {
            window.showToast('Đã xảy ra lỗi khi lưu.', 'error');
        }
        window.showModal("Lỗi lưu dữ liệu: <br><span class='small'>" + (error.message || "") + "</span>", "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = prevLabel;
        }
    }
};

window.renderAdminFacilities = () => {
    const listEl = document.getElementById('admin-facility-list');
    const countEl = document.getElementById('admin-facility-count');
    if (!listEl) return;

    const facilities = Array.isArray(window.allFacilities) ? window.allFacilities : [];
    if (countEl) countEl.textContent = `${facilities.length} cơ sở`;
    if (facilities.length === 0) {
        listEl.innerHTML = '<div class="admin-empty-state"><span>Chưa có cơ sở nào trong hệ thống.</span></div>';
        return;
    }

    listEl.innerHTML = facilities.map((facility, index) => `
        <div class="admin-facility-item">
            <span class="admin-facility-index">${index + 1}</span>
            <span class="admin-facility-main"><strong>${window.escapeHtml(facility)}</strong></span>
            <span class="admin-facility-status">Đang hoạt động</span>
        </div>`).join('');
};

window.createFacility = async (e) => {
    if (!auth || !auth.currentUser) { window.showToast('Lỗi: Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng tải lại trang!', 'error'); return; }
    e?.preventDefault?.();

    const btn = e?.currentTarget || document.querySelector('#sec-facility button[onclick="window.createFacility()"]');
    const prevLabel = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Đang xử lý...';
    }

    const name = document.getElementById("new-facility-input")?.value.trim().toUpperCase();
    if (!name) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = prevLabel;
        }
        return window.showModal("Vui lòng nhập tên Cơ Sở!", "error");
    }

    try {
        const check = await getDocs(query(collection(db, "facilities"), where("name", "==", name)));
        if (!check.empty) return window.showModal("Cơ sở đã tồn tại!", "error");
        await addDoc(collection(db, "facilities"), { name: name });
        window.invalidateStudentCaches?.();
        window.showModal(`Đã tạo cơ sở: ${name}`, "success");
        window.showToast(`Thêm cơ sở ${name} thành công!`, 'success');
        const nfInput = document.getElementById("new-facility-input");
        if (nfInput) nfInput.value = "";
        window.closeModal?.();
        await init();
        window.renderAdminFacilities?.();
        window.loadDashboardData();
    } catch (error) {
        console.error(error);
        if (error.code === 'permission-denied') {
            window.showToast('Lỗi phân quyền: Dữ liệu bị từ chối. Hãy kiểm tra lại tài khoản.', 'error');
        } else {
            window.showToast('Đã xảy ra lỗi khi lưu.', 'error');
        }
        window.showModal("Lỗi tạo cơ sở: " + (error.message || ""), "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = prevLabel;
        }
    }
};

window.createKhoi = async (e) => {
    if (!auth || !auth.currentUser) { window.showToast('Lỗi: Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng tải lại trang!', 'error'); return; }
    e?.preventDefault?.();

    const btn = e?.currentTarget || document.querySelector('#sec-khoi button[onclick="window.createKhoi()"]');
    const prevLabel = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Đang xử lý...';
    }

    const fn = document.getElementById("select-facility-tao-khoi")?.value;
    const name = document.getElementById("new-khoi-input")?.value.trim().toUpperCase();
    if (!fn || !name) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = prevLabel;
        }
        return window.showModal("Vui lòng chọn Cơ sở và nhập tên Khối!", "error");
    }

    try {
        const check = await getDocs(query(collection(db, "categories"), where("name", "==", name), where("facility", "==", fn)));
        if (!check.empty) return window.showModal("Khối đã tồn tại!", "error");
        await addDoc(collection(db, "categories"), { name: name, facility: fn });
        window.invalidateClassOptionCaches?.();
        window.showModal(`Đã tạo khối: ${name}`, "success");
        window.showToast(`Thêm khối ${name} thành công!`, 'success');
        const nkInput = document.getElementById("new-khoi-input");
        if (nkInput) nkInput.value = "";
        window.closeModal?.();
        await init();
        window.loadDashboardData();
    } catch (error) {
        console.error(error);
        if (error.code === 'permission-denied') {
            window.showToast('Lỗi phân quyền: Dữ liệu bị từ chối. Hãy kiểm tra lại tài khoản.', 'error');
        } else {
            window.showToast('Đã xảy ra lỗi khi lưu.', 'error');
        }
        window.showModal("Lỗi tạo khối: " + (error.message || ""), "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = prevLabel;
        }
    }
};

window.createClass = async (e) => {
    if (!auth || !auth.currentUser) { window.showToast('Lỗi: Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng tải lại trang!', 'error'); return; }
    e?.preventDefault?.();

    const btn = e?.currentTarget || document.querySelector('#sec-lop button[onclick="window.createClass()"]');
    const prevLabel = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Đang xử lý...';
    }

    const fn = document.getElementById("select-facility-tao-lop")?.value;
    const khoi = document.getElementById("select-khoi-tao-lop")?.value;
    const className = document.getElementById("new-class-input")?.value.trim().toUpperCase();
    if (!fn || !khoi || !className) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = prevLabel;
        }
        return window.showModal("Vui lòng chọn Cơ Sở, Khối và nhập tên Lớp!", "error");
    }

    try {
        const check = await getDocs(query(collection(db, "classes"), where("name", "==", className), where("category", "==", khoi), where("facility", "==", fn)));
        if (!check.empty) return window.showModal(`Lớp đã tồn tại!`, "error");
        await addDoc(collection(db, "classes"), { name: className, category: khoi, facility: fn });
        window.invalidateStudentCaches?.();
        await setDoc(doc(db, "ThongKe", window.toThongKeDocId(fn)), { SoLop: increment(1) }, { merge: true });
        window.showModal(`Đã tạo lớp!`, "success");
        window.showToast(`Thêm lớp ${className} thành công!`, 'success');
        const ncInput = document.getElementById("new-class-input");
        if (ncInput) ncInput.value = "";
        window.closeModal?.();
        window.loadDashboardData();
    } catch (error) {
        console.error(error);
        if (error.code === 'permission-denied') {
            window.showToast('Lỗi phân quyền: Dữ liệu bị từ chối. Hãy kiểm tra lại tài khoản.', 'error');
        } else {
            window.showToast('Đã xảy ra lỗi khi lưu.', 'error');
        }
        window.showModal("Lỗi tạo lớp: " + (error.message || ""), "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = prevLabel;
        }
    }
};

window.loadTeachersList = async () => {
    const listEl = document.getElementById("admin-teacher-list");
    if (!listEl) return;

    try {
        const snap = await getDocs(collection(db, "teachers"));
        window.allTeachers = [];
        let teacherDocs = [];

        snap.forEach(d => {
            window.allTeachers.push(d.data().teacherName);
            teacherDocs.push({ id: d.id, name: d.data().teacherName });
        });

        window.allTeachers.sort((a, b) => a.localeCompare(b, 'vi'));
        teacherDocs.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

        if (listEl) {
            if (teacherDocs.length === 0) {
                listEl.innerHTML = `<div class="admin-empty-state"><i class="fas fa-user-slash"></i><span>Chưa có giáo viên nào trong hệ thống.</span></div>`;
                return;
            }

            const rows = teacherDocs.map((t, index) => `
                <tr class="admin-teacher-row">
                    <td class="admin-teacher-index">${index + 1}</td>
                    <td><button type="button" class="admin-teacher-main admin-teacher-summary-toggle" data-teacher-name="${window.escapeHtml(t.name)}" aria-label="Xem thống kê giáo viên ${window.escapeHtml(t.name)}"><span class="admin-teacher-icon"><i class="fas fa-user" aria-hidden="true"></i></span><strong>${window.escapeHtml(t.name)}</strong><span class="admin-teacher-open-label">Xem thống kê</span><i class="fas fa-chevron-right admin-teacher-toggle-icon" aria-hidden="true"></i></button></td>
                    <td class="admin-teacher-action-cell"><button type="button" class="btn btn-sm admin-icon-button admin-icon-button-danger" onclick="window.deleteTeacher(${window.jsArg(t.id)}, ${window.jsArg(t.name)})" title="Xóa giáo viên này" aria-label="Xóa giáo viên ${window.escapeHtml(t.name)}"><i class="fas fa-trash-alt"></i><span class="d-none d-md-inline ms-1">Xóa</span></button></td>
                </tr>`).join('');
            listEl.innerHTML = `<div class="admin-teacher-table-wrap"><table class="admin-teacher-table"><thead><tr><th>STT</th><th>GIÁO VIÊN</th><th>THAO TÁC</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        }
    } catch (e) {
        if (listEl) listEl.innerHTML = `<div class="text-danger p-3">Lỗi: ${e.message}</div>`;
        console.error("Lỗi tải danh sách GV:", e);
    }
};

window.addSingleTeacher = async (e) => {
    if (!auth || !auth.currentUser) { window.showToast('Lỗi: Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng tải lại trang!', 'error'); return; }
    e?.preventDefault?.();

    const btn = e?.currentTarget || document.querySelector('#sec-gv button[onclick="window.addSingleTeacher()"]');
    const prevLabel = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Đang xử lý...';
    }

    const nameInp = document.getElementById("new-teacher-input");
    const name = nameInp ? nameInp.value.trim() : "";
    if (!name) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = prevLabel;
        }
        return window.showModal("Vui lòng nhập tên giáo viên!", "error");
    }

    try {
        const check = await getDocs(query(collection(db, "teachers"), where("teacherName", "==", name)));
        if (!check.empty) return window.showModal("Giáo viên này đã có trong hệ thống!", "error");

        await addDoc(collection(db, "teachers"), { teacherName: name, createdAt: serverTimestamp() });
        window.showModal(`Đã thêm GV: ${name}`, "success");
        window.showToast(`Thêm giáo viên ${name} thành công!`, 'success');
        if (nameInp) nameInp.value = "";
        window.closeModal?.();

        await window.loadTeachersList();
    } catch (error) {
        console.error(error);
        if (error.code === 'permission-denied') {
            window.showToast('Lỗi phân quyền: Dữ liệu bị từ chối. Hãy kiểm tra lại tài khoản.', 'error');
        } else {
            window.showToast('Đã xảy ra lỗi khi lưu.', 'error');
        }
        window.showModal("Lỗi thêm GV: " + (error.message || ""), "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = prevLabel;
        }
    }
};

window.deleteTeacher = (docId, tName) => {
    window.showModal(`Bạn có chắc chắn muốn xóa giáo viên <b class="text-danger">${tName}</b> khỏi hệ thống không?`, 'confirm', async () => {
        try {
            await deleteDoc(doc(db, "teachers", docId));
            window.showModal("Đã xóa thành công!", "success");
            await window.loadTeachersList();
        } catch (e) {
            window.showModal("Lỗi xóa: " + e.message, "error");
        }
    });
};
/* ==========================================
   5. NHẬP LIỆU BÁO CÁO (GIÁO VIÊN)
========================================== */

window.renderNhapLieuLoading = () => {
    const lop = document.getElementById("select-lop-gv")?.value;
    const area = document.getElementById("area-cards");
    const searchContainer = document.getElementById("search-student-container");
    const footer = document.getElementById("save-footer");
    const step3Form = document.getElementById("step-3-form-nl");

    if (!lop || !area) return;
    if (step3Form) {
        step3Form.style.display = "block";
        step3Form.classList.add("mobile-show-form");
    }
    window.ensureTeacherInfoPanelVisible?.();
    if (searchContainer) searchContainer.style.display = "block";
    if (footer) footer.style.display = "none";
    area.innerHTML = `<div id='loading-card-msg' class='smooth-box text-center p-5 text-muted'><i class="fas fa-spinner fa-spin fa-2x mb-3"></i><h5 class="mt-3">\u0110ang t\u1ea3i danh s\u00e1ch h\u1ecdc sinh...</h5></div>`;
    if (window.innerWidth <= 768) document.body.setAttribute("data-wizard-step", "3");
};

window.renderNhapLieuLoadError = () => {
    const area = document.getElementById("area-cards");
    const footer = document.getElementById("save-footer");
    if (!area) return;
    if (footer) footer.style.display = "none";
    area.innerHTML = `
        <div class="smooth-box text-center p-4 text-muted">
            <i class="fas fa-wifi text-warning fa-2x mb-3"></i>
            <h5 class="mb-2">Chưa tải được danh sách học sinh</h5>
            <p class="mb-3">Kết nối đang chậm. Dữ liệu đã lưu trên máy vẫn được giữ nguyên.</p>
            <button type="button" class="btn btn-outline-success px-4" onclick="window.loadSchedulesForClass({ preserveDraft: true })">
                <i class="fas fa-redo-alt me-2"></i>Thử tải lại
            </button>
        </div>`;
};

window.renderNhapLieuEmptyStudents = () => {
    const area = document.getElementById("area-cards");
    const searchContainer = document.getElementById("search-student-container");
    const footer = document.getElementById("save-footer");
    if (!area) return;
    if (searchContainer) searchContainer.style.display = "none";
    if (footer) footer.style.display = "none";
    area.innerHTML = `<div class="smooth-box text-center p-4 text-muted" role="status">
        <i class="fas fa-user-slash fa-2x mb-3"></i>
        <h5 class="mb-2">Lớp chưa có học sinh</h5>
        <p class="mb-0">Vui lòng chọn lớp khác hoặc liên hệ quản lý để cập nhật danh sách.</p>
    </div>`;
};

window.loadSchedulesForClass = async (options = {}) => {
    const lop = document.getElementById("select-lop-gv")?.value;
    const facilityName = window.getCurrentTeacherFacility();
    const selectedShift = options && typeof options === "object" ? (options.selectedSchedule || "") : "";
    const preserveDraft = !!(options && typeof options === "object" && options.preserveDraft);
    if (!preserveDraft) {
        window.clearTeacherWorkingDraft?.({
            clearGlobalContent: true,
            clearCards: true,
            clearPersisted: true
        });
    }
    window.syncTeacherClassDependentUI?.();
    window.populateShiftSelect(selectedShift);

    if (!lop) {
        window.renderNhapLieu({ preserveDraft });
        return;
    }

    window.uiAsyncState.scheduleRequestId += 1;
    window.uiAsyncState.studentsRequestId += 1;
    const requestId = window.uiAsyncState.scheduleRequestId;
    window.uiAsyncState.isLoadingStudents = true;
    window.uiAsyncState.studentsStatus = "loading";
    let renderedFromCache = false;

    const cachedPayload = window.getCachedClassStudentsPayload(facilityName, lop, { allowStale: true });
    if (cachedPayload && Array.isArray(cachedPayload.classStudents)) {
        window.applyClassStudentsPayload(cachedPayload);
        if (cachedPayload.classStudents.length > 0) {
            window.renderNhapLieu({ preserveDraft });
            window.uiAsyncState.studentsStatus = "success";
        } else {
            window.renderNhapLieuEmptyStudents();
            window.uiAsyncState.studentsStatus = "empty";
        }
        renderedFromCache = true;
    } else {
        window.renderNhapLieuLoading?.();
    }

    try {
        const classStudentsKey = window.makeDataKey(facilityName, lop);
        if (!window.uiAsyncState.classStudentsFetches) window.uiAsyncState.classStudentsFetches = {};
        if (!window.uiAsyncState.classStudentsFetches[classStudentsKey]) {
            window.uiAsyncState.classStudentsFetches[classStudentsKey] = window.measureUiRequest(
                "spt:class-students",
                () => window.withUiReadRetry(() => window.withUiTimeout(
                    getDocs(window.getClassStudentsQuery(lop, facilityName)),
                    FIRESTORE_UI_QUERY_TIMEOUT_MS,
                    "Tải danh sách học sinh quá thời gian"
                ))
            )
                .finally(() => {
                    delete window.uiAsyncState.classStudentsFetches[classStudentsKey];
                });
        }
        const snap = await window.uiAsyncState.classStudentsFetches[classStudentsKey];
        if (requestId !== window.uiAsyncState.scheduleRequestId) return;
        if (lop !== document.getElementById("select-lop-gv")?.value || facilityName !== window.getCurrentTeacherFacility()) return;

        const rawStudents = [];

        snap.forEach(d => {
            const data = d.data();
            rawStudents.push({ id: d.id, ...data });
        });

        const payload = window.getClassStudentsPayloadFromList(rawStudents);
        window.saveCachedClassStudentsPayload(facilityName, lop, payload);
        window.applyClassStudentsPayload(payload);
        window.studentsByFacilityClass[classStudentsKey] = rawStudents.slice();

        const hasCards = !!document.querySelector("#area-cards .student-card");
        if (payload.classStudents.length === 0) {
            window.uiAsyncState.studentsStatus = "empty";
            window.renderNhapLieuEmptyStudents();
        } else {
            window.uiAsyncState.studentsStatus = "success";
            if (!hasCards || !renderedFromCache) window.renderNhapLieu({ preserveDraft });
            else window.syncNhapLieuFormState?.();
        }
    } catch (e) {
        console.error("Lỗi tải danh sách học sinh:", e);
        if (!renderedFromCache) {
            window.classStudents = [];
            window.uiAsyncState.studentsStatus = "error";
            window.renderNhapLieuLoadError?.();
        } else {
            window.uiAsyncState.studentsStatus = "success";
            window.syncNhapLieuFormState?.();
            window.showToast?.("Đang dùng danh sách học sinh đã lưu trên thiết bị.", "warning");
        }
    } finally {
        if (requestId === window.uiAsyncState.scheduleRequestId) {
            window.uiAsyncState.isLoadingStudents = false;
            window.populateShiftSelect(document.getElementById("select-schedule-gv")?.value || selectedShift);
        }
    }
};

window.renderNhapLieu = async (options = {}) => {
    const preserveDraft = !!options.preserveDraft;
    const lop = document.getElementById("select-lop-gv")?.value;
    const area = document.getElementById("area-cards");
    const searchContainer = document.getElementById("search-student-container");
    const footer = document.getElementById("save-footer");
    window.syncTeacherClassDependentUI?.();

    if (!area) return;
    if (!lop) {
        window.uiAsyncState.studentsRequestId += 1;
        window.addedStudents.clear();
        if (!preserveDraft) window.tempCache = {};
        area.innerHTML = "";
        if (searchContainer) searchContainer.style.display = "none";
        if (footer) footer.style.display = "none";
        return;
    }

    if (searchContainer) searchContainer.style.display = "block";
    window.addedStudents.clear();
    if (!preserveDraft) window.tempCache = {};
    area.innerHTML = `<div id='empty-card-msg' class='smooth-box text-center p-5 text-muted'><i class="fas fa-search fa-3x mb-3"></i><h5 class="mt-3">Chưa có học sinh nào được chọn.</h5></div>`;
    if (footer) footer.style.display = "block";
    window.syncNhapLieuFormState?.();
};

window.showStudentPicker = () => {
    const filterText = document.getElementById("inlineSearchInput")?.value.toLowerCase() || "";
    const l = document.getElementById("studentPickerList");
    if (!l) return;
    l.innerHTML = "";
    let count = 0;

    window.classStudents.forEach(t => {
        if (!window.addedStudents.has(t) && t.toLowerCase().includes(filterText)) {
            count++;
            const i = document.createElement("div");
            i.className = "dropdown-item-custom";
            i.innerText = t;
            i.onclick = () => {
                window.handleStudentChangeEffect(t);
                window.addStudentCard(t);
                const sInput = document.getElementById("inlineSearchInput");
                if (sInput) sInput.value = "";
                l.style.display = "none";
                document.body.classList.remove("student-picker-open");
                const footer = document.getElementById("save-footer");
                if (footer) footer.style.display = "block";
                window.syncNhapLieuFormState?.();

                // Gọi lại init kéo thả khi thêm mới thẻ để SortableJS nhận diện thẻ vừa thêm
                window.initDragAndDrop();
            };
            l.appendChild(i);
        }
    });
    const isPickerOpen = count > 0;
    l.style.display = isPickerOpen ? "block" : "none";
    document.body.classList.toggle("student-picker-open", isPickerOpen);
};

window.showTeacherPicker = () => {
    const filterText = document.getElementById("tenGV")?.value.toLowerCase() || "";
    const l = document.getElementById("teacherPickerList");
    if (!l) return;
    l.innerHTML = "";
    let count = 0;

    const uniqueTeachers = [...new Set(window.allTeachers)];

    uniqueTeachers.forEach(t => {
        if (t.toLowerCase().includes(filterText)) {
            count++;
            const i = document.createElement("div");
            i.className = "dropdown-item-custom";

            const regex = new RegExp(`(${filterText})`, 'gi');
            i.innerHTML = `<i class="fas fa-chalkboard-teacher text-muted me-2"></i> ` + t.replace(regex, `<span class="text-success fw-bold">$1</span>`);

            i.onclick = () => {
                const sInput = document.getElementById("tenGV");
                if (sInput) sInput.value = t;
                l.style.display = "none";
            };
            l.appendChild(i);
        }
    });
    l.style.display = count > 0 ? "block" : "none";
};

window.applyGlobalContent = (val) => {
    document.querySelectorAll('#area-cards .student-card').forEach(card => {
        if (!card.classList.contains('card-saved-temp')) {
            const inpNd = card.querySelector('.input-nd');
            if (inpNd) {
                inpNd.value = val;
                window.markAsUnsaved(inpNd, card.getAttribute('data-name'));
            }
        }
    });
};

// ============================================================
// HÀM KHỞI TẠO KÉO THẢ TÁI SỬ DỤNG (DRAG & DROP UNIVERSAL)
// ============================================================
window.initDragAndDrop = () => {
    const container = document.getElementById("area-cards");
    if (!container) return; // Bảo vệ: tránh lỗi nếu container chưa có

    // Hủy phiên cũ nếu có để tránh chạy chồng chéo
    if (window.sortableCardInst) {
        window.sortableCardInst.destroy();
    }

    const sortableConfig = {
        handle: '.drag-handle',
        filter: 'input, textarea, select, button, .btn, .dropdown-list, .input-nd, .input-nx-dynamic',
        preventOnFilter: false,
        delay: 220,
        delayOnTouchOnly: true,
        touchStartThreshold: 10,
        animation: 170,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        draggable: '.student-card',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        forceFallback: true,
        fallbackClass: 'sortable-fallback',
        fallbackOnBody: true,
        fallbackTolerance: 7,
        scroll: true,
        bubbleScroll: true,
        scrollSensitivity: 90,
        scrollSpeed: 14,
        onStart: () => {
            document.body.classList.add('student-card-sorting');
            window.suppressReviewActionsUntil = Date.now() + 700;
            if (navigator.vibrate) navigator.vibrate(8);
        },
        onEnd: () => {
            document.body.classList.remove('student-card-sorting');
            window.suppressReviewActionsUntil = Date.now() + 450;
            window.updateStudentIndices();
            window.scheduleSaveAppState?.();
        },
        onCancel: () => {
            document.body.classList.remove('student-card-sorting');
            window.suppressReviewActionsUntil = Date.now() + 450;
        }
    };

    // Kiểm tra Sortable đã load xong từ CDN chưa (chú ý: phải dùng window.Sortable)
    if (typeof window.Sortable !== 'undefined') {
        window.sortableCardInst = new window.Sortable(container, sortableConfig);
    } else {
        console.warn('[SortableJS] Đang chờ thư viện tải...');
        setTimeout(() => {
            if (typeof window.Sortable !== 'undefined') {
                if (window.sortableCardInst) window.sortableCardInst.destroy();
                window.sortableCardInst = new window.Sortable(container, sortableConfig);
            }
        }, 800);
    }
};


window.addStudentCard = (ten) => {
    if (window.addedStudents.has(ten)) return;
    window.addedStudents.add(ten);
    const emptyMsg = document.getElementById("empty-card-msg");
    if (emptyMsg) emptyMsg.style.display = 'none';

    const area = document.getElementById("area-cards");
    const gcInput = document.getElementById('global-nd-input');
    const globalContent = gcInput ? gcInput.value.trim() : "";

    const initialNd = "";

    let criteria = window.currentCommentPrefix ? window.currentCommentPrefix.split(',').map(s => s.trim()).filter(s => s) : [];
    if (criteria.length === 0) criteria = ['Nhận xét'];

    let dynamicInputsHtml = criteria.map(c => {
        let savedDraft = "";
        return `<input type="text" class="input-nx-dynamic form-control" data-label="${c}" placeholder="${c}..." value="${savedDraft}" oninput="window.markAsUnsaved(this, '${ten}')">`;
    }).join('');

    let school = window.studentSchoolMap[ten] || "";
    let schoolHtml = school ? ` <span class="school-text">( ${school} )</span>` : "";

    const cardHTML = `
    <div class="card-custom student-card review-student-card mb-3" data-name="${ten}" id="card-${ten.replace(/\s/g, '')}" data-note="" data-student-doc-id="">
        <div class="d-flex justify-content-between align-items-center mb-2 student-card-header">
            <div class="drag-handle" title="Kéo để sắp xếp lại"><i class="fas fa-grip-vertical"></i></div>
            <div class="d-flex align-items-center student-card-identity">
                <h6 class="fw-bold m-0 student-name-title text-dark">${ten}${schoolHtml}</h6>
            </div>
            <div class="d-flex student-card-actions">
                <button type="button" class="btn btn-sm btn-outline-info student-card-action" onclick="window.viewStudentHistory(this.closest('.student-card').dataset.name, 'home')" title="Xem lịch sử" aria-label="Xem lịch sử học sinh"><i class="fas fa-history" aria-hidden="true"></i></button>
                <button type="button" class="btn btn-sm btn-outline-danger student-card-action" onclick="window.removeStudentCard(this)" title="Xóa thẻ" aria-label="Xóa thẻ học sinh"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>
                <button type="button" class="btn btn-sm btn-outline-warning student-card-action" onclick="window.addSpecialNote(this, this.closest('.student-card').dataset.name)" title="Ghi chú" aria-label="Ghi chú học sinh"><i class="fas fa-comment-dots" aria-hidden="true"></i></button>
                <button type="button" class="btn btn-sm btn-outline-secondary btn-luu-hs student-card-action" onclick="window.cacheLe(this, this.closest('.student-card').dataset.name)" title="Lưu" aria-label="Lưu nhận xét học sinh"><i class="fas fa-save" aria-hidden="true"></i></button>
            </div>
        </div>
        <!-- Vùng hiển thị ghi chú cũ đã bị gỡ bỏ theo tư duy UX mới -->
        <div class="dynamic-inputs-container">
            <input type="text" class="form-control input-nd" placeholder="Nhập phần nội dung..." value="${initialNd}" oninput="window.markAsUnsaved(this, '${ten}')">
            ${dynamicInputsHtml}
        </div>
    </div>`;

    if (area) area.insertAdjacentHTML('beforeend', cardHTML);
    const newCard = document.getElementById(`card-${ten.replace(/\s/g, '')}`);
    if (newCard) {
        const docId = window.studentDocIdByName[ten] || '';
        const ghiChu = window.studentGhiChuByName[ten] != null ? window.studentGhiChuByName[ten] : '';
        newCard.setAttribute('data-student-doc-id', docId);
        newCard.setAttribute('data-note', ghiChu);
    }
    window.updateStudentIndices();
    window.syncNhapLieuFormState?.();
    window.scheduleSaveAppState?.();
};

window.removeStudentCard = (buttonOrName) => {
    const button = buttonOrName instanceof Element ? buttonOrName : null;
    const card = button?.closest('.student-card')
        || document.getElementById(`card-${String(buttonOrName || '').replace(/\s/g, '')}`);
    if (!card || card.classList.contains('is-removing')) return;

    const ten = card.getAttribute('data-name') || String(buttonOrName || '');
    card.classList.add('is-removing');
    card.querySelectorAll('button, input, textarea, select').forEach((control) => {
        control.disabled = true;
    });
    button?.blur();

    const cardHeight = card.getBoundingClientRect().height;
    card.style.height = `${cardHeight}px`;
    card.style.maxHeight = `${cardHeight}px`;

    requestAnimationFrame(() => {
        card.classList.add('is-removing-active');
        card.style.height = '0px';
        card.style.maxHeight = '0px';
    });

    window.setTimeout(() => {
        window.addedStudents.delete(ten);
        delete window.tempCache[ten];
        window.clearStudentDrafts(ten);
        card.remove();

        const emsg = document.getElementById("empty-card-msg");
        if (window.addedStudents.size === 0 && emsg) emsg.style.display = 'block';

        window.updateStudentIndices();
        window.syncNhapLieuFormState?.();
        window.scheduleSaveAppState?.();
    }, 190);
};

window.addSpecialNote = (btn, ten) => {
    const card = document.getElementById(`card-${ten.replace(/\s/g, '')}`);
    if (!card) return;
    window.showModal(`Ghi chú đặc biệt cho: <b>${ten}</b>`, "prompt-note", async (val) => {
        await window.saveStudentSpecialNote(ten, val, card);
    }, card.getAttribute('data-note') || "");
};

/** Lưu ghi chú đặc biệt (trường ghiChu) lên document students trên Firestore */
window.saveStudentSpecialNote = async (ten, val, card) => {
    let docId = card.getAttribute('data-student-doc-id');
    const lop = document.getElementById('select-lop-gv')?.value || '';
    if (!docId && lop) {
        const facilityName = window.getCurrentTeacherFacility();
        const filters = [where('className', '==', lop), where('studentName', '==', ten)];
        if (facilityName) filters.push(where('facility', '==', facilityName));
        const q = query(collection(db, 'students'), ...filters);
        const snap = await getDocs(q);
        if (snap.empty) throw new Error('Không tìm thấy học sinh trong lớp.');
        docId = snap.docs[0].id;
        card.setAttribute('data-student-doc-id', docId);
        window.studentDocIdByName[ten] = docId;
    }
    if (!docId) throw new Error('Chưa xác định được lớp hoặc học sinh.');
    await updateDoc(doc(db, 'students', docId), { ghiChu: val });
    window.invalidateStudentCaches?.();
    card.setAttribute('data-note', val);
    window.studentGhiChuByName[ten] = val;
    window.updateHistoryPanelNoteIfOpen(ten, val);
};

/** Cập nhật khối ghi chú trên panel Lịch sử nếu đang mở đúng học sinh */
window.updateHistoryPanelNoteIfOpen = (ten, noteText) => {
    const panel = document.getElementById('class-side-panel');
    if (!panel || !panel.classList.contains('active')) return;
    if (panel.getAttribute('data-history-student') !== ten) return;

    const subTitle = document.getElementById('panel-sub-title');
    const wrap = subTitle && subTitle.querySelector('.history-header-info');
    let box = document.getElementById('history-note-content');

    if (noteText) {
        if (box) {
            const inner = box.querySelector('.note-inner');
            if (inner) {
                inner.textContent = '';
                const ic = document.createElement('i');
                ic.className = 'fas fa-exclamation-triangle me-2 history-note-warning-icon';
                inner.appendChild(ic);
                inner.appendChild(document.createTextNode(noteText));
            }
        } else if (wrap) {
            const holder = document.createElement('div');
            holder.className = 'history-note-box w-100 text-start';
            holder.id = 'history-note-content';
            holder.style.display = 'block';
            const inner = document.createElement('div');
            inner.className = 'note-inner';
            const ic = document.createElement('i');
            ic.className = 'fas fa-exclamation-triangle me-2 history-note-warning-icon';
            inner.appendChild(ic);
            inner.appendChild(document.createTextNode(noteText));
            holder.appendChild(inner);
            wrap.appendChild(holder);
        }
    } else if (box) {
        box.remove();
    }
};

window.cacheLe = (btn, ten) => {
    const card = btn.closest('.card-custom');
    if (!card) return;

    let ndInp = card.querySelector('.input-nd');
    let rawNd = ndInp ? ndInp.value.trim() : "";

    let nxArr = [];
    let nxPlainArr = [];
    card.querySelectorAll('.input-nx-dynamic').forEach(inp => {
        let val = inp.value.trim();
        let label = inp.getAttribute('data-label');
        if (val) {
            nxArr.push(`<div class="nx-item"><span class="nx-label">${label}:</span> <span class="nx-val">${val}</span></div>`);
            nxPlainArr.push(`${label}: ${val}`);
        }
    });

    let rawNx = nxArr.join('');
    let rawNxPlain = nxPlainArr.join(' | ');
    const noteVal = card.getAttribute('data-note') || "";

    if (!rawNd && !rawNx && !noteVal) return window.showModal("Trống nội dung!", "error");

    window.tempCache[ten] = { nd: rawNd, nx: rawNx, nxPlain: rawNxPlain, note: noteVal };
    card.classList.add('card-saved-temp');
    btn.className = "btn btn-sm btn-success text-white btn-luu-hs";
    btn.innerHTML = `<i class="fas fa-check"></i>`;
    window.scheduleSaveAppState?.();
};

window.markAsUnsaved = (inputEl, ten) => {
    const card = inputEl.closest('.card-custom');
    if (!card) return;
    const btn = card.querySelector('.btn-luu-hs');

    if (card.classList.contains('card-saved-temp')) {
        card.classList.remove('card-saved-temp');
        if (btn) {
            btn.className = "btn btn-sm btn-outline-secondary btn-luu-hs";
            btn.innerHTML = `<i class="fas fa-save"></i>`;
        }
        delete window.tempCache[ten];
    }
    window.scheduleSaveAppState?.();
};

/* ==========================================
   THUẬT TOÁN XÓA DỮ LIỆU TỪ SIDE PANEL
========================================== */
window.handleGenerateReport = async (event) => {
    if (event.type === 'touchend') {
        touchHandled = true;
    } else if (event.type === 'click' && touchHandled) {
        touchHandled = false;
        return;
    }

    if (isProcessingAction) {
        showToast('Đang xử lý, vui lòng đợi...', 'warning');
        return;
    }
    isProcessingAction = true;

    try {
        if (document.activeElement) document.activeElement.blur();
        window.generateReport();
    } catch (error) {
        console.error('Lỗi:', error);
        showToast('Lỗi: ' + error.message, 'error');
    } finally {
        isProcessingAction = false;
    }
};

window.generateReport = () => {
    const rawDate = document.getElementById("ngayDay")?.value;
    if (!rawDate) return window.showModal("Thiếu Ngày Dạy!", "error");

    const parts = rawDate.split('-');
    const shortDate = `${parts[2]}/${parts[1]}`;

    const facName = window.getFacilityCode(document.getElementById("select-facility-gv")?.value || "");

    let caHoc = document.getElementById("select-schedule-gv")?.value || "";
    caHoc = caHoc.trim();
    if (!caHoc) return window.showModal("Thiếu Ca học!", "error");
    const globalContent = document.getElementById('global-nd-input')?.value.trim() || "";
    const gcTrim = globalContent;

    const getGroupKey = (ndRieng) => {
        const nd = (ndRieng || '').trim();
        if (nd && nd !== gcTrim) return nd;
        if (gcTrim) return gcTrim;
        if (nd) return nd;
        return '';
    };

    /** Một dòng học sinh: -tên tbc..., tbm... (theo mẫu báo cáo) */
    const formatStudentLine = (tenFull, nxPlain, noteVal) => {
        const bits = [];
        if (nxPlain) bits.push(nxPlain);
        if (noteVal) bits.push(`gc ${noteVal}`);
        const tail = bits.join(', ');
        const name = tenFull.toLowerCase();
        return tail ? `-${name} ${tail}` : `-${name}`;
    };

    const entries = [];
    document.querySelectorAll('.student-card').forEach(card => {
        const tenFull = card.getAttribute('data-name') || '';

        const nxArr = [];
        card.querySelectorAll('.input-nx-dynamic').forEach(inp => {
            const val = inp.value.trim();
            const label = inp.getAttribute('data-label');
            if (val) {
                const abbr = label.trim().split(/\s+/).map(w => w.charAt(0).toLowerCase()).join('');
                nxArr.push(`${abbr} ${val}`);
            }
        });
        const nxPlain = nxArr.join(', ');
        const ndRieng = card.querySelector('.input-nd')?.value.trim() || '';
        const noteVal = card.getAttribute('data-note') || '';

        const lineParts = [];
        if (ndRieng && ndRieng !== globalContent) lineParts.push(ndRieng);
        if (nxPlain) lineParts.push(nxPlain);
        if (noteVal) lineParts.push(`gc ${noteVal}`);

        if (lineParts.length === 0) return;

        entries.push({
            groupKey: getGroupKey(ndRieng),
            tenFull,
            nxPlain,
            noteVal
        });
    });

    if (entries.length === 0) return window.showModal("Chưa có nhận xét nào để tạo báo cáo!", "error");

    const { grouped, keysInOrder } = entries.reduce(
        (acc, entry) => {
            const k = entry.groupKey;
            if (!acc.grouped[k]) {
                acc.grouped[k] = [];
                acc.keysInOrder.push(k);
            }
            acc.grouped[k].push(entry);
            return acc;
        },
        { grouped: {}, keysInOrder: [] }
    );

    let reportText = `${facName}: ${caHoc.toLowerCase()}, ${shortDate}\n`;

    const orphanGlobal = gcTrim && !keysInOrder.includes(gcTrim);
    if (orphanGlobal) reportText += `${gcTrim}\n`;

    const groupBlocks = keysInOrder.map((key) => {
        const list = grouped[key];
        const studentLines = list.map((e) => formatStudentLine(e.tenFull, e.nxPlain, e.noteVal));
        if (key) {
            return [key.toLowerCase(), ...studentLines].join('\n');
        }
        return studentLines.join('\n');
    });

    reportText += groupBlocks.join('\n');

    const rEl = document.getElementById('global-report-content');
    if (rEl) rEl.value = reportText.trim();
    window.showModal("Tạo báo cáo thành công!", "success");
};

window.copyGlobalReport = (btn) => {
    const rEl = document.getElementById('global-report-content'); const content = rEl ? rEl.value : "";
    if (!content) return window.showModal("Khung báo cáo trống!", "error");
    navigator.clipboard.writeText(content).then(() => {
        window.showModal("Đã sao chép báo cáo!", "success");
        const oldContent = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check me-2"></i>Đã sao chép';
        setTimeout(() => { btn.innerHTML = oldContent; }, 2000);
    });
};

window.shareGlobalReport = async () => {
    const rEl = document.getElementById('global-report-content');
    const content = rEl ? rEl.value.trim() : "";
    if (!content) return window.showModal("Khung báo cáo trống!", "error");

    try {
        if (navigator.share) {
            await navigator.share({
                title: "Báo cáo nhận xét",
                text: content
            });
            return;
        }
        await navigator.clipboard.writeText(content);
        window.showModal("Thiết bị chưa hỗ trợ chia sẻ trực tiếp. Báo cáo đã được copy để bạn dán thủ công.", "info");
    } catch (err) {
        if (err?.name !== "AbortError") {
            console.error("[shareGlobalReport]", err);
            window.showModal("Không thể mở chia sẻ: " + (err.message || ""), "error");
        }
    }
};

window.saveFinal = async () => {
    if (window.uiAsyncState.isSubmittingFinal) return;
    const tgEl = document.getElementById("tenGV"); let gv = tgEl ? tgEl.value.trim() : "";
    const rawDate = document.getElementById("ngayDay")?.value;
    const selectedShift = document.getElementById("select-schedule-gv")?.value || "";
    const slEl = document.getElementById("select-lop-gv"); const lop = slEl ? slEl.value : "";
    const skEl = document.getElementById("select-khoi-gv"); const khoi = skEl ? skEl.value : "";
    let facName = khoi ? (Object.keys(window.facilityCategoriesMap).find(fac => window.facilityCategoriesMap[fac].includes(khoi)) || "Cơ sở 1") : "Cơ sở 1";

    if (!gv || !rawDate) return window.showModal("Thiếu Tên GV hoặc Ngày dạy!", "error");
    if (!selectedShift) return window.showModal("Vui lòng chọn Ca học!", "error");

    facName = window.getCurrentTeacherFacility() || facName;

    const dStr = rawDate.split('-').reverse().join('/');

    const keys = Object.keys(window.tempCache); if (keys.length === 0) return window.showModal("Chưa lưu thẻ nào!", "error");
    const saveFinalBtn = document.querySelector('button[onclick="window.saveFinal()"]');
    const saveStartedAt = Date.now();
    window.uiAsyncState.isSubmittingFinal = true;
    window.uiAsyncState.finalSaveStartedAt = saveStartedAt;
    const prevSaveLabel = saveFinalBtn ? saveFinalBtn.innerHTML : "";
    if (saveFinalBtn) {
        saveFinalBtn.dataset.defaultLabel = prevSaveLabel;
        saveFinalBtn.disabled = true;
        saveFinalBtn.innerHTML = 'Đang xử lý...';
    }
    clearTimeout(finalSaveUnlockTimer);
    finalSaveUnlockTimer = setTimeout(() => window.resetStaleFinalSaveState?.(true), 30000);
    const lessonInstanceId = window.getOrCreateLessonInstanceId();
    const batchId = window.createLessonBatchId({
        facility: facName,
        className: lop,
        date: dStr,
        shift: selectedShift,
        teacher: gv,
        lessonInstanceId
    });
    window.persistTeacherWorkingDraft?.();
    window.saveAppState?.();
    const batch = writeBatch(db);

    try {
        keys.forEach(ten => {
            const cached = window.tempCache[ten] || {};
            const card = window.getSavedStudentCard?.(ten);
            const studentId = card?.getAttribute("data-student-doc-id") || window.studentDocIdByName?.[ten] || "";
            const recordKeyPayload = {
                facility: facName,
                className: lop,
                date: dStr,
                shift: selectedShift,
                teacher: gv,
                studentName: ten,
                studentId,
                lessonInstanceId
            };
            const recordKey = window.createRecordKey(recordKeyPayload);
            const recordId = window.createRecordDocId(recordKeyPayload);
            batch.set(doc(db, "records", recordId), {
                studentName: ten,
                studentId,
                className: lop,
                facility: facName,
                date: dStr,
                shift: selectedShift,
                teacher: gv,
                content: cached.nd || "",
                comment: cached.nx || "",
                commentPlain: cached.nxPlain || "",
                specialNote: cached.note || "",
                timestamp: serverTimestamp(),
                updatedAt: serverTimestamp(),
                batchId,
                lessonInstanceId,
                recordKey,
                recordKeyVersion: 3
            }, { merge: true });
        });

        await batch.commit();
        window.invalidateA2RecordsCache?.();
        window.invalidateDashboardRecordsCache?.();
        window.clearPersistedTeacherWorkingDraft?.();
        keys.forEach((ten) => window.clearStudentDrafts(ten));
        window.showModal("Đã lưu thành công!", "success");

        window.updateDashboardSummaryForBatch({
                batchId,
                dateKey: rawDate,
                facility: facName,
                recordCount: keys.length
            }).catch(summaryError => {
            console.error("Dashboard summary update failed:", summaryError);
            window.invalidateDashboardSummaryCache?.();
        });

        setTimeout(() => {
            window.resetLessonInstanceId?.();
            window.renderNhapLieu();
            const reportContent = document.getElementById('global-report-content');
            if (reportContent) reportContent.value = '';
            const globalNd = document.getElementById('global-nd-input');
            if (globalNd) globalNd.value = '';
            window.scheduleSaveAppState?.();
        }, 1000);
    } catch (error) {
        console.error("Lỗi lưu nhận xét:", error);
        window.persistTeacherWorkingDraft?.();
        window.showModal("Không thể lưu do kết nối bị gián đoạn. Dữ liệu vẫn được giữ để bạn thử lại.", "error");
    } finally {
        if (window.uiAsyncState.finalSaveStartedAt === saveStartedAt) {
            clearTimeout(finalSaveUnlockTimer);
            finalSaveUnlockTimer = null;
            window.uiAsyncState.isSubmittingFinal = false;
            window.uiAsyncState.finalSaveStartedAt = 0;
            if (saveFinalBtn) {
                saveFinalBtn.disabled = false;
                saveFinalBtn.innerHTML = prevSaveLabel;
            }
        }
    }
};

/* ==========================================
   6. DASHBOARD & BIỂU ĐỒ
========================================== */
window.loadAllStudentsForGlobalSearch = async (options = {}) => {
    const useCache = options.useCache !== false;
    const refreshInBackground = options.refreshInBackground !== false;
    const forceRefresh = options.forceRefresh === true;

    if (!forceRefresh && useCache) {
        const cacheEnvelope = window.getGlobalSearchCacheEnvelope({ allowExpired: true });
        const cachedPayload = cacheEnvelope?.payload || null;
        if (cachedPayload) {
            window.applyGlobalSearchPayload(cachedPayload);
            const versionCheckedAt = Number(cacheEnvelope.versionCheckedAt || 0);
            const shouldRevalidate = refreshInBackground
                && Date.now() - versionCheckedAt >= GLOBAL_SEARCH_VERSION_CHECK_INTERVAL_MS;
            if (shouldRevalidate) {
                window.revalidateGlobalSearchCache(cacheEnvelope)
                    .catch(e => console.error("Background global search version check failed:", e));
            }
            return window.allStudentsGlobalList;
        }
    }

    if (globalSearchFetchPromise) return globalSearchFetchPromise;

    globalSearchFetchPromise = (async () => {
        try {
            await window.waitForInitialData();
            if (globalSearchVersionBumpPromise) await globalSearchVersionBumpPromise;

            const versionPromise = options.knownDataVersion != null
                ? Promise.resolve(Number(options.knownDataVersion) || 0)
                : window.fetchGlobalSearchDataVersion({ force: true }).catch(() => 0);
            const [classSnap, studentSnap, dataVersion] = await Promise.all([
                getDocs(collection(db, "classes")),
                getDocs(collection(db, "students")),
                versionPromise
            ]);
            const classCategoryMap = {};
            const classesByFacilityCategory = {};
            const facilityCategoriesFromClasses = {};
            const categoryColorMap = {};
            let catIndex = 0;

            classSnap.forEach(d => {
                const cData = d.data();
                const className = cData.name || "";
                const category = cData.category || "Khac";
                const facility = cData.facility || "";
                if (!className) return;

                classCategoryMap[className] = category;
                const fcKey = window.makeDataKey(facility, category);
                if (!classesByFacilityCategory[fcKey]) classesByFacilityCategory[fcKey] = [];
                classesByFacilityCategory[fcKey].push(className);

                if (facility) {
                    if (!facilityCategoriesFromClasses[facility]) facilityCategoriesFromClasses[facility] = [];
                    facilityCategoriesFromClasses[facility].push(category);
                }

                if (!categoryColorMap[category]) {
                    categoryColorMap[category] = pastelColors[catIndex % pastelColors.length];
                    catIndex++;
                }
            });

            Object.keys(classesByFacilityCategory).forEach(key => {
                classesByFacilityCategory[key] = [...new Set(classesByFacilityCategory[key])].sort((a, b) => a.localeCompare(b, "vi"));
            });
            Object.keys(facilityCategoriesFromClasses).forEach(fac => {
                facilityCategoriesFromClasses[fac] = [...new Set(facilityCategoriesFromClasses[fac])].sort((a, b) => a.localeCompare(b, "vi"));
            });

            const allStudentsGlobalList = [];

            studentSnap.forEach(d => {
                const data = d.data();
                const className = data.className || "";
                const facility = data.facility || "CS1";
                allStudentsGlobalList.push({
                    id: d.id,
                    name: data.studentName,
                    studentName: data.studentName,
                    className,
                    facility,
                    category: classCategoryMap[className] || "Khac",
                    school: data.school || "",
                    ghiChu: data.ghiChu != null ? String(data.ghiChu) : "",
                    schedules: data.schedules || []
                });
            });
            allStudentsGlobalList.sort((a, b) => a.name.localeCompare(b.name, "vi"));

            window.applyGlobalSearchPayload({
                allStudentsGlobalList,
                classCategoryMap,
                categoryColorMap,
                classesByFacilityCategory,
                facilityCategoriesMap: Object.keys(window.facilityCategoriesMap || {}).length > 0
                    ? window.facilityCategoriesMap
                    : facilityCategoriesFromClasses
            });
            window.saveGlobalSearchPayload(dataVersion);
            return window.allStudentsGlobalList;
        } catch (e) {
            console.error("Loi tai danh sach tim kiem:", e);
            const cachedPayload = window.getCachedGlobalSearchPayload();
            if (cachedPayload) window.applyGlobalSearchPayload(cachedPayload);
            return window.allStudentsGlobalList;
        } finally {
            globalSearchFetchPromise = null;
        }
    })();

    return globalSearchFetchPromise;
};

window.showGlobalDropdownA2 = async () => {
    const l = document.getElementById("dropdownListA2Global");
    if (!l) return;
    l.innerHTML = "";

    const si = document.getElementById("global-hs-search-input");
    const filterText = si ? si.value.trim() : "";
    const normalizedFilter = window.normalizeSearchText(filterText);

    const renderMessage = message => {
        const item = document.createElement("div");
        item.className = "dropdown-item-custom text-muted text-center py-3";
        const text = document.createElement("i");
        text.textContent = message;
        item.appendChild(text);
        l.replaceChildren(item);
        l.style.display = "block";
    };

    if (normalizedFilter.length < STUDENT_SEARCH_MIN_LENGTH) {
        renderMessage("Nh\u1eadp \u00edt nh\u1ea5t 2 k\u00fd t\u1ef1 \u0111\u1ec3 t\u00ecm h\u1ecdc sinh");
        return;
    }

    const requestId = ++studentSearchRequestId;
    renderMessage("\u0110ang t\u00ecm h\u1ecdc sinh...");
    let searchResult;
    try {
        searchResult = await window.searchStudentsByName(filterText);
    } catch (error) {
        console.error("Khong the tim hoc sinh:", error);
        if (requestId === studentSearchRequestId) {
            renderMessage("Kh\u00f4ng th\u1ec3 t\u00ecm ki\u1ebfm. Vui l\u00f2ng th\u1eed l\u1ea1i.");
        }
        return;
    }

    if (requestId !== studentSearchRequestId) return;
    if (window.normalizeSearchText(si?.value || "") !== normalizedFilter) return;
    const matches = searchResult.results || [];
    l.innerHTML = "";

    if (matches.length === 0) {
        renderMessage(searchResult.indexed
            ? "Kh\u00f4ng t\u00ecm th\u1ea5y k\u1ebft qu\u1ea3 n\u00e0o"
            : "D\u1eef li\u1ec7u t\u00ecm ki\u1ebfm \u0111ang \u0111\u01b0\u1ee3c chu\u1ea9n b\u1ecb. Vui l\u00f2ng th\u1eed l\u1ea1i sau.");
    } else {
        matches.slice(0, STUDENT_SEARCH_QUERY_LIMIT).forEach(hs => {
            const i = document.createElement("div");
            i.className = "dropdown-item-custom";

            const row = document.createElement("div");
            row.className = "d-flex justify-content-between align-items-center w-100 evaluation-search-result-row";
            const name = document.createElement("div");
            name.className = "text-truncate me-2 evaluation-search-result-name";
            name.textContent = hs.name;
            const categoryColor = window.categoryColorMap[hs.category] || { bg: "#f0fdf4", text: "#166534" };
            const classBadge = document.createElement("span");
            classBadge.className = "badge flex-shrink-0 evaluation-search-result-badge";
            classBadge.style.setProperty("--evaluation-badge-bg", categoryColor.bg);
            classBadge.style.setProperty("--evaluation-badge-color", categoryColor.text);
            classBadge.textContent = `L\u1edbp ${window.formatClassName(hs.className, hs.facility)}`;
            row.append(name, classBadge);
            i.appendChild(row);

            i.onclick = () => {
                const ghs = document.getElementById("global-hs-search-input"); if (ghs) ghs.value = hs.name;
                const shs = document.getElementById("selected-hs-class-a2"); if (shs) shs.value = hs.className;
                const sid = document.getElementById("selected-hs-id-a2"); if (sid) sid.value = hs.id || "";
                window.currentA2SelectedStudent = {
                    id: hs.id || "",
                    name: hs.name,
                    studentName: hs.name,
                    className: hs.className,
                    facility: hs.facility || "",
                    category: hs.category || ""
                };
                l.style.display = "none";
                window.renderSoA2Global();
            };
            l.appendChild(i);
        });
    }
    l.style.display = "block";
};

window.filterGlobalA2 = () => {
    const shs = document.getElementById("selected-hs-class-a2");
    const sid = document.getElementById("selected-hs-id-a2");
    if (shs) shs.value = "";
    if (sid) sid.value = "";
    window.currentA2SelectedStudent = null;
    clearTimeout(studentSearchDebounceTimer);

    const l = document.getElementById("dropdownListA2Global");
    const inputValue = document.getElementById("global-hs-search-input")?.value || "";
    if (window.normalizeSearchText(inputValue).length < STUDENT_SEARCH_MIN_LENGTH) {
        studentSearchRequestId += 1;
        if (l) {
            const item = document.createElement("div");
            item.className = "dropdown-item-custom text-muted text-center py-3";
            item.textContent = "Nh\u1eadp \u00edt nh\u1ea5t 2 k\u00fd t\u1ef1 \u0111\u1ec3 t\u00ecm h\u1ecdc sinh";
            l.replaceChildren(item);
            l.style.display = "block";
        }
        return;
    }

    studentSearchDebounceTimer = setTimeout(() => {
        window.showGlobalDropdownA2();
    }, STUDENT_SEARCH_DEBOUNCE_MS);
};

window.filterFacilityChange = () => {
    const fac = document.getElementById('filter-facility').value;
    const khoiSelect = document.getElementById('filter-khoi');
    const lopSelect = document.getElementById('filter-lop');

    khoiSelect.innerHTML = '<option value="">-- Tất cả Khối --</option>';
    lopSelect.innerHTML = '<option value="">-- Tất cả Lớp --</option>';

    if (fac && window.facilityCategoriesMap[fac]) {
        let list = window.facilityCategoriesMap[fac];
        list.sort().forEach(k => khoiSelect.innerHTML += `<option value="${k}">${k}</option>`);
    }
};

window.filterKhoiChange = () => {
    const fac = document.getElementById('filter-facility').value;
    const khoi = document.getElementById('filter-khoi').value;
    const lopSelect = document.getElementById('filter-lop');

    lopSelect.innerHTML = '<option value="">-- Tất cả Lớp --</option>';

    if (fac && khoi) {
        getDocs(query(collection(db, "classes"), where("category", "==", khoi), where("facility", "==", fac))).then(snap => {
            let classes = [];
            snap.forEach(d => classes.push(d.data().name));
            classes.sort().forEach(c => lopSelect.innerHTML += `<option value="${c}">${c}</option>`);
        });
    }
};

window.filterFacilityChange = async (options = {}) => {
    const facSelect = document.getElementById('filter-facility');
    const khoiSelect = document.getElementById('filter-khoi');
    const lopSelect = document.getElementById('filter-lop');
    if (!facSelect || !khoiSelect || !lopSelect) return;

    const fac = facSelect.value;
    const selectedKhoi = options.preserveKhoi || options.selectedKhoi || "";
    const selectedLop = options.preserveLop || options.selectedLop || "";
    const requestId = ++window.uiAsyncState.reviewFacilityRequestId;
    window.uiAsyncState.reviewClassRequestId += 1;
    window.uiAsyncState.reviewFilterRequestId += 1;

    window.setSelectOptions(lopSelect, "-- T\u1ea5t c\u1ea3 L\u1edbp --", []);

    if (!fac) {
        window.setSelectOptions(khoiSelect, "-- T\u1ea5t c\u1ea3 Kh\u1ed1i --", []);
        return;
    }

    window.setSelectLoadingState(khoiSelect, true, "-- \u0110ang t\u1ea3i Kh\u1ed1i... --");
    window.setSelectLoadingState(lopSelect, true, "-- Ch\u1ecdn Kh\u1ed1i tr\u01b0\u1edbc --");

    try {
        const categories = await window.getFacilityCategories(fac);
        if (requestId !== window.uiAsyncState.reviewFacilityRequestId) return;

        window.setSelectOptions(khoiSelect, "-- T\u1ea5t c\u1ea3 Kh\u1ed1i --", categories, selectedKhoi);
        window.setSelectOptions(lopSelect, "-- T\u1ea5t c\u1ea3 L\u1edbp --", []);

        if (selectedKhoi && categories.includes(selectedKhoi)) {
            khoiSelect.value = selectedKhoi;
            await window.filterKhoiChange({ preserveLop: selectedLop });
        }
    } catch (error) {
        if (requestId === window.uiAsyncState.reviewFacilityRequestId) {
            window.setSelectOptions(khoiSelect, "-- T\u1ea5t c\u1ea3 Kh\u1ed1i --", []);
            window.setSelectOptions(lopSelect, "-- T\u1ea5t c\u1ea3 L\u1edbp --", []);
        }
        console.error("Loi tai khoi bo loc:", error);
    }
};

window.filterKhoiChange = async (options = {}) => {
    const fac = document.getElementById('filter-facility')?.value || "";
    const khoi = document.getElementById('filter-khoi')?.value || "";
    const lopSelect = document.getElementById('filter-lop');
    if (!lopSelect) return;

    const selectedLop = options.preserveLop || options.selectedLop || "";
    const requestId = ++window.uiAsyncState.reviewClassRequestId;
    window.uiAsyncState.reviewFilterRequestId += 1;

    if (!fac || !khoi) {
        window.setSelectOptions(lopSelect, "-- T\u1ea5t c\u1ea3 L\u1edbp --", []);
        return;
    }

    let renderedFromCache = false;
    const cachedPayload = window.getCachedClassOptionsPayload?.(fac, khoi);
    if (cachedPayload && Array.isArray(cachedPayload.classes)) {
        window.setSelectOptions(lopSelect, "-- T\u1ea5t c\u1ea3 L\u1edbp --", cachedPayload.classes, selectedLop);
        renderedFromCache = true;
        return;
    } else {
        window.setSelectLoadingState(lopSelect, true, "-- \u0110ang t\u1ea3i L\u1edbp... --");
    }

    try {
        const cacheKey = window.makeDataKey(fac, khoi);
        if (!window.uiAsyncState.reviewClassOptionsFetches) window.uiAsyncState.reviewClassOptionsFetches = {};
        if (!window.uiAsyncState.reviewClassOptionsFetches[cacheKey]) {
            window.uiAsyncState.reviewClassOptionsFetches[cacheKey] = getDocs(query(collection(db, "classes"), where("category", "==", khoi), where("facility", "==", fac)))
                .then(snap => snap.docs.map(d => d.data().name).filter(Boolean))
                .finally(() => {
                    delete window.uiAsyncState.reviewClassOptionsFetches[cacheKey];
                });
        }
        let classes = await window.uiAsyncState.reviewClassOptionsFetches[cacheKey];
        classes = [...new Set(classes)].sort((a, b) => a.localeCompare(b, "vi"));
        window.classesByFacilityCategory[cacheKey] = classes.slice();
        window.saveCachedClassOptionsPayload?.(fac, khoi, {
            classes,
            nxPrefix: window.categoryPrefixByFacilityCategory?.[cacheKey] || ""
        });
        if (window.allStudentsGlobalList.length > 0) window.saveGlobalSearchPayload?.();

        if (requestId !== window.uiAsyncState.reviewClassRequestId) return;
        window.setSelectOptions(lopSelect, "-- T\u1ea5t c\u1ea3 L\u1edbp --", classes, selectedLop);
    } catch (error) {
        if (requestId === window.uiAsyncState.reviewClassRequestId && !renderedFromCache) {
            window.setSelectOptions(lopSelect, "-- T\u1ea5t c\u1ea3 L\u1edbp --", []);
        }
        console.error("Loi tai lop bo loc:", error);
    }
};

window.rehydrateReviewFilters = async (review = null) => {
    const stateReview = review || window.getSavedAppState?.()?.review || {};
    const facSelect = document.getElementById("filter-facility");
    const khoiSelect = document.getElementById("filter-khoi");
    const lopSelect = document.getElementById("filter-lop");
    const searchInput = document.getElementById("global-hs-search-input");

    if (searchInput && stateReview.studentSearch) searchInput.value = stateReview.studentSearch;
    if (!facSelect || !khoiSelect || !lopSelect || !stateReview.facility) return;

    facSelect.value = stateReview.facility;
    await window.filterFacilityChange({
        preserveKhoi: stateReview.khoi || "",
        preserveLop: stateReview.lop || ""
    });
};

window.renderA2FilterStudentList = (students = [], listArea = document.getElementById('filter-students-list')) => {
    if (!listArea) return;
    const filtered = Array.isArray(students)
        ? students.filter(hs => hs && (hs.name || hs.studentName))
        : [];

    if (filtered.length === 0) {
        listArea.innerHTML = `<div class="text-center text-muted p-4 border rounded bg-light">Kh\u00f4ng t\u00ecm th\u1ea5y h\u1ecdc sinh n\u00e0o ph\u00f9 h\u1ee3p.</div>`;
        return;
    }

    const badgeColors = [];
    let html = `<div class="filter-student-list-mobile">`;
    filtered.forEach((hs, index) => {
        const name = hs.name || hs.studentName || "";
        const catColor = window.categoryColorMap?.[hs.category] || { bg: '#f0fdf4', text: '#166534' };
        badgeColors.push(catColor);
        html += `
            <div class="filter-student-item" onclick="window.viewStudentFromFilter(${window.jsArg(name)}, ${window.jsArg(hs.className)}, ${window.jsArg(hs.id || '')}, ${window.jsArg(hs.facility || '')}, ${window.jsArg(hs.category || '')})">
                <div class="fsi-icon"><i class="fas fa-user-graduate"></i></div>
                <div class="fsi-name">${window.escapeHtml(name)}</div>
                <span class="fsi-badge" data-fsi-badge-index="${index}">L\u1edbp ${window.escapeHtml(window.formatClassName(hs.className, hs.facility))}</span>
                <div class="fsi-arrow"><i class="fas fa-chevron-right"></i></div>
            </div>`;
    });
    html += `</div>`;
    listArea.innerHTML = html;
    listArea.querySelectorAll('[data-fsi-badge-index]').forEach(badge => {
        const color = badgeColors[Number(badge.dataset.fsiBadgeIndex)];
        if (!color) return;
        badge.style.setProperty('--fsi-badge-bg', color.bg);
        badge.style.setProperty('--fsi-badge-text', color.text);
        badge.style.setProperty('--fsi-badge-border', `${color.text}50`);
    });
};

window.executeFilter = async () => {
    {
        const fac = document.getElementById('filter-facility')?.value || "";
        const khoi = document.getElementById('filter-khoi')?.value || "";
        const lop = document.getElementById('filter-lop')?.value || "";
        const listArea = document.getElementById('filter-students-list');

        if (!fac) return window.showModal("Vui l\u00f2ng ch\u1ecdn \u00edt nh\u1ea5t 1 C\u01a1 s\u1edf \u0111\u1ec3 l\u1ecdc!", "error");
        if (!listArea) return;

        const requestId = ++window.uiAsyncState.reviewFilterRequestId;
        listArea.style.display = 'block';
        const cachedStudents = window.getCachedA2FilterStudents?.(fac, khoi, lop);
        if (cachedStudents) {
            window.renderA2FilterStudentList(cachedStudents, listArea);
            return;
        } else {
            listArea.innerHTML = `<div class="text-center text-primary p-4"><i class="fas fa-spinner fa-spin fa-2x"></i><div class="mt-2 fw-bold">\u0110ang t\u1ed5ng h\u1ee3p d\u1eef li\u1ec7u h\u1ecdc sinh...</div></div>`;
        }

        try {
            const filtered = await window.fetchA2FilteredStudents(fac, khoi, lop);
            if (requestId !== window.uiAsyncState.reviewFilterRequestId) return;
            window.renderA2FilterStudentList(filtered, listArea);
        } catch (error) {
            if (requestId !== window.uiAsyncState.reviewFilterRequestId) return;
            if (!cachedStudents) {
                console.error(error);
                listArea.innerHTML = `<div class="text-center text-danger p-4 border rounded bg-light">L\u1ed7i truy xu\u1ea5t d\u1eef li\u1ec7u: ${window.escapeHtml(error.message || '')}</div>`;
            }
        }
        return;
    }

};

window.viewStudentFromFilter = (name, className, studentId = "", facility = "", category = "") => {
    const ghs = document.getElementById("global-hs-search-input");
    const shs = document.getElementById("selected-hs-class-a2");
    const sid = document.getElementById("selected-hs-id-a2");
    if (ghs) ghs.value = name;
    if (shs) shs.value = className;
    if (sid) sid.value = studentId;
    window.currentA2SelectedStudent = {
        id: studentId,
        name,
        studentName: name,
        className,
        facility,
        category
    };

    document.getElementById('a2-filter-area').style.display = 'none';
    window.renderSoA2Global();
};

window.renderSoA2Global = async () => {
    {
        const ghs = document.getElementById("global-hs-search-input");
        const shs = document.getElementById("selected-hs-class-a2");
        const sid = document.getElementById("selected-hs-id-a2");
        let ten = ghs ? ghs.value.trim() : "";
        let lop = shs ? shs.value : "";
        const selectedId = sid ? sid.value : "";
        const area = document.getElementById("area-so-a2");

        if (!ten) return window.showModal("Vui l\u00f2ng nh\u1eadp t\u00ean h\u1ecdc sinh!", "error");

        const contextualStudent = window.currentA2SelectedStudent
            && window.normalizeSearchText(window.currentA2SelectedStudent.name || "") === window.normalizeSearchText(ten)
            && (!lop || window.currentA2SelectedStudent.className === lop)
            ? window.currentA2SelectedStudent
            : null;

        let selectedStudent = selectedId
            ? window.allStudentsGlobalList.find(h => h.id === selectedId) || contextualStudent
            : contextualStudent;

        if (selectedStudent) {
            ten = selectedStudent.name || selectedStudent.studentName || ten;
            lop = selectedStudent.className || lop;
            if (sid && selectedStudent.id) sid.value = selectedStudent.id;
            if (shs && selectedStudent.className) shs.value = selectedStudent.className;
        }

        if (!lop) {
            const normalizedName = window.normalizeSearchText(ten);
            const searchResult = await window.searchStudentsByExactName(ten);
            const exactMatches = (searchResult.results || [])
                .filter(h => window.normalizeSearchText(h.name) === normalizedName);
            if (exactMatches.length > 1) {
                window.showGlobalDropdownA2();
                return window.showModal("H\u1ecdc sinh n\u00e0y c\u00f3 nhi\u1ec1u l\u1edbp. Vui l\u00f2ng ch\u1ecdn \u0111\u00fang l\u1edbp trong danh s\u00e1ch g\u1ee3i \u00fd.", "info");
            }

            const matchedHS = exactMatches[0] || (searchResult.results || [])[0];
            if (!matchedHS) {
                return window.showModal(searchResult.indexed
                    ? "Kh\u00f4ng t\u00ecm th\u1ea5y h\u1ecdc sinh!"
                    : "D\u1eef li\u1ec7u t\u00ecm ki\u1ebfm \u0111ang \u0111\u01b0\u1ee3c chu\u1ea9n b\u1ecb. Vui l\u00f2ng th\u1eed l\u1ea1i sau.", "error");
            }

            selectedStudent = matchedHS;
            ten = matchedHS.name;
            lop = matchedHS.className;
            if (sid) sid.value = matchedHS.id || "";
            if (shs) shs.value = matchedHS.className || "";
            window.currentA2SelectedStudent = matchedHS;
        }

        selectedStudent = selectedStudent || window.allStudentsGlobalList.find(
            h => window.normalizeSearchText(h.name) === window.normalizeSearchText(ten) && h.className === lop
        ) || null;

        const facilityName = selectedStudent?.facility || window.currentA2SelectedStudent?.facility || "";
        window.currentA2Context = {
            studentId: selectedStudent?.id || selectedId || "",
            studentName: ten,
            className: lop,
            facility: facilityName
        };

        const sArea = document.getElementById('a2-search-area'); if (sArea) sArea.style.display = 'none';
        const fArea = document.getElementById('a2-filter-area'); if (fArea) fArea.style.display = 'none';
        const rArea = document.getElementById('a2-result-area'); if (rArea) rArea.style.display = 'block';
        window.updateBackButtonVisibility?.();

        const requestId = ++window.uiAsyncState.a2RecordRequestId;
        const renderRecords = (data = []) => {
            if (requestId !== window.uiAsyncState.a2RecordRequestId) return;
            window.currentA2Data = data;
            if (data.length === 0 && area) {
                area.innerHTML = `<div class='smooth-box text-center p-5 text-muted'>H\u1ecdc sinh ch\u01b0a c\u00f3 \u0111\u00e1nh gi\u00e1.</div>
                <button type="button" class="btn btn-3d-rounded btn-3d-back mt-3" onclick="document.getElementById('a2-result-area').style.display='none'; document.getElementById('a2-search-area').style.display='block'; document.getElementById('a2-filter-area').style.display='block';"><i class="fas fa-chevron-left me-2"></i> Quay l\u1ea1i</button>`;
                return;
            }
            window.currentPageA2 = 1;
            window.renderStandardEvaluationTable();
        };

        const cachedRecords = window.getCachedA2RecordsPayload?.(facilityName, ten, lop);
        if (cachedRecords) {
            renderRecords(cachedRecords);
            return;
        }

        if (area) {
            area.style.display = 'block';
            area.innerHTML = "<div class='smooth-box p-5 text-center text-info fw-bold'>\u0110ang t\u1ed5ng h\u1ee3p d\u1eef li\u1ec7u...</div>";
        }

        try {
            const data = await window.fetchA2RecordsForStudent(ten, lop, facilityName, {
                studentId: selectedStudent?.id || selectedId || ""
            });
            renderRecords(data);
        } catch (err) {
            if (requestId === window.uiAsyncState.a2RecordRequestId && area) {
                area.innerHTML = `<div class='text-danger'>L\u1ed7i: ${window.escapeHtml(err.message || '')}</div>`;
            }
        }
        return;
    }

    const ghs = document.getElementById("global-hs-search-input");
    const shs = document.getElementById("selected-hs-class-a2");
    const sid = document.getElementById("selected-hs-id-a2");
    let ten = ghs ? ghs.value.trim() : "";
    let lop = shs ? shs.value : "";
    let selectedId = sid ? sid.value : "";
    const area = document.getElementById("area-so-a2");

    if (!ten) return window.showModal("Vui lòng nhập tên học sinh!", "error");
    let selectedStudent = selectedId
        ? window.allStudentsGlobalList.find(h => h.id === selectedId)
        : null;

    if (selectedStudent) {
        ten = selectedStudent.name;
        lop = selectedStudent.className;
    }

    if (!lop) {
        const normalizedName = window.normalizeSearchText(ten);
        const exactMatches = window.allStudentsGlobalList.filter(h => window.normalizeSearchText(h.name) === normalizedName);
        if (exactMatches.length > 1) {
            window.showGlobalDropdownA2();
            return window.showModal("Học sinh này có nhiều lớp. Vui lòng chọn đúng lớp trong danh sách gợi ý.", "info");
        }
        const matchedHS = exactMatches[0] || window.allStudentsGlobalList.find(h => window.normalizeSearchText(h.name).includes(normalizedName));
        if (matchedHS) {
            lop = matchedHS.className;
            ten = matchedHS.name;
            selectedStudent = matchedHS;
            if (sid) sid.value = matchedHS.id || "";
            if (shs) shs.value = matchedHS.className || "";
        }
        else return window.showModal("Không tìm thấy học sinh!", "error");
    }
    selectedStudent = selectedStudent || window.allStudentsGlobalList.find(
        h => window.normalizeSearchText(h.name) === window.normalizeSearchText(ten) && h.className === lop
    ) || null;
    window.currentA2Context = {
        studentName: ten,
        className: lop,
        facility: selectedStudent?.facility || ""
    };

    const sArea = document.getElementById('a2-search-area'); if (sArea) sArea.style.display = 'none';
    const fArea = document.getElementById('a2-filter-area'); if (fArea) fArea.style.display = 'none';
    const rArea = document.getElementById('a2-result-area'); if (rArea) rArea.style.display = 'block';
    window.updateBackButtonVisibility?.();

    if (area) {
        area.style.display = 'block';
        area.innerHTML = "<div class='smooth-box p-5 text-center text-info fw-bold'>Đang tổng hợp dữ liệu...</div>";
    }

    try {
        const snap = await getDocs(query(collection(db, "records"), where("studentName", "==", ten), where("className", "==", lop)));
        let data = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() }));

        data.sort((a, b) => {
            const tA = window.parseDateVn(a.date);
            const tB = window.parseDateVn(b.date);
            if (tA !== tB) return tB - tA;
            return (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0);
        });

        window.currentA2Data = data;

        if (data.length === 0 && area) {
            area.innerHTML = `<div class='smooth-box text-center p-5 text-muted'>Học sinh chưa có đánh giá.</div>
            <button type="button" class="btn btn-3d-rounded btn-3d-back mt-3" onclick="document.getElementById('a2-result-area').style.display='none'; document.getElementById('a2-search-area').style.display='block'; document.getElementById('a2-filter-area').style.display='block';"><i class="fas fa-chevron-left me-2"></i> Quay lại</button>`;
            return;
        }
        window.currentPageA2 = 1;
        window.renderStandardEvaluationTable();
    } catch (err) {
        if (area) area.innerHTML = `<div class='text-danger'>Lỗi: ${err.message}</div>`;
    }
};

window.setEvaluationZoom = (zoom) => {
    const allowed = [25, 50, 75, 100, 125, 150, 175, 200];
    const value = allowed.includes(Number(zoom)) ? Number(zoom) : 100;
    window.currentEvaluationZoom = value;

    const stage = document.getElementById('evaluationZoomStage');
    if (stage) {
        const area = stage.closest('#area-so-a2');
        stage.setAttribute('data-zoom', String(value));
        stage.style.height = 'auto';

        if (window.matchMedia('(max-width: 768px)').matches) {
            const scale = value / 100;
            stage.style.setProperty('width', `${100 / scale}%`, 'important');
            stage.style.setProperty('max-width', 'none', 'important');
            stage.style.setProperty('flex', '0 0 auto', 'important');
            stage.style.transform = `scale(${scale})`;
            stage.style.webkitTransform = `scale(${scale})`;
            if (area) area.style.setProperty('overflow-x', 'hidden', 'important');

            requestAnimationFrame(() => {
                const naturalHeight = stage.scrollHeight;
                stage.style.height = `${Math.ceil(naturalHeight * scale)}px`;
            });
        } else {
            stage.style.removeProperty('width');
            stage.style.removeProperty('max-width');
            stage.style.removeProperty('flex');
            stage.style.removeProperty('transform');
            stage.style.removeProperty('-webkit-transform');
            stage.style.removeProperty('height');
            if (area) area.style.removeProperty('overflow-x');
        }
    }

    const select = document.getElementById('evaluationZoomSelect');
    if (select && Number(select.value) !== value) select.value = String(value);
};

if (!window.evaluationZoomResizeBound) {
    window.evaluationZoomResizeBound = true;
    window.addEventListener('resize', () => {
        clearTimeout(window.evaluationZoomResizeTimer);
        window.evaluationZoomResizeTimer = setTimeout(() => {
            if (document.getElementById('evaluationZoomStage')) {
                window.setEvaluationZoom(window.currentEvaluationZoom || 100);
            }
        }, 120);
    });
}

window.renderStandardEvaluationTable = () => {
    const area = document.getElementById("area-so-a2");
    const data = window.currentA2Data;
    const currentPage = window.currentPageA2 || 1;
    const lessonsPerBlock = 6;
    const blocksPerPage = 4;
    const lessonsPerPage = lessonsPerBlock * blocksPerPage;

    const totalPages = Math.ceil(data.length / lessonsPerPage) || 1;
    const startIndex = (currentPage - 1) * lessonsPerPage;
    const endIndex = Math.min(startIndex + lessonsPerPage, data.length);
    const currentData = data.slice(startIndex, endIndex);

    const studentName = window.currentA2Context?.studentName || currentData[0]?.studentName || '';
    const className = window.currentA2Context?.className || currentData[0]?.className || '';
    const zoomLevels = [25, 50, 75, 100, 125, 150, 175, 200];
    const currentZoom = window.currentEvaluationZoom || 100;
    const facilityName = window.currentA2Context?.facility || currentData[0]?.facility || 'Cơ sở 1';

    let html = `
    <div class="eval-detail-header evaluation-student-summary page-break-avoid">
        <div class="eval-detail-topbar">
            <div class="eval-detail-actions">
                <button type="button" class="eval-action-btn eval-action-edit" onclick="window.promptEditRecord()" title="Chỉnh sửa" aria-label="Chỉnh sửa"><i class="fas fa-edit"></i></button>
                <button type="button" class="eval-action-btn eval-action-export admin-only" onclick="window.openExportModal()" title="Xuất phiếu" aria-label="Xuất phiếu"><i class="fas fa-file-export"></i></button>
                <button type="button" class="eval-action-btn eval-action-delete admin-only" onclick="window.promptDeleteRecord()" title="Xóa" aria-label="Xóa"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
        <div class="eval-student-info eval-student-line">
            <h3 class="eval-student-name">${studentName}</h3>
            <div class="eval-student-tags">
                <span><i class="fas fa-layer-group"></i>Lớp ${window.formatClassName(className, facilityName)}</span>
            </div>
        </div>
    </div>
    <div class="eval-zoom-toolbar evaluation-zoom-toolbar page-break-avoid" aria-label="T\u00f9y ch\u1ec9nh k\u00edch c\u1ee1 xem phi\u1ebfu">
        <div class="eval-zoom-title"><i class="fas fa-search-minus"></i><span>K\u00edch c\u1ee1 xem</span></div>
        <select id="evaluationZoomSelect" class="form-select form-select-sm eval-zoom-select evaluation-zoom-select" aria-label="Ch\u1ecdn k\u00edch c\u1ee1 xem phi\u1ebfu" onchange="window.setEvaluationZoom(this.value)">
            ${zoomLevels.map(level => `<option value="${level}" ${level === currentZoom ? 'selected' : ''}>${level}%</option>`).join('')}
        </select>
    </div>
    <div id="evaluationZoomStage" class="eval-zoom-stage evaluation-zoom-stage" data-zoom="${currentZoom}">`;

    const blocks = [];
    for (let i = 0; i < currentData.length; i += lessonsPerBlock) {
        blocks.push(currentData.slice(i, i + lessonsPerBlock));
    }

    blocks.forEach(block => {
        const getInvisibleCells = () => { return '<td class="invisible-cell"></td>'.repeat(lessonsPerBlock - block.length); };

        html += `
        <div class="excel-table-wrapper evaluation-table-card page-break-avoid">
            <table class="excel-evaluation-table eval-custom-table evaluation-table table-bordered w-100 mb-0">
                <colgroup>
                    <col class="evaluation-label-column">
                    <col class="evaluation-data-column">
                    <col class="evaluation-data-column">
                    <col class="evaluation-data-column">
                    <col class="evaluation-data-column">
                    <col class="evaluation-data-column">
                    <col class="evaluation-data-column">
                </colgroup>
                <tbody>
                    <tr>
                        <th class="grad-thang">THÁNG</th>
                        ${block.map(r => {
            let m = parseInt(r.date.split('/')[1]);
            return `<td class="evaluation-month-cell">THÁNG ${m}</td>`;
        }).join('')}${getInvisibleCells()}
                    </tr>
                    <tr>
                        <th class="grad-gv">TÊN GV</th>
                        ${block.map(r => `<td class="fw-bold text-center evaluation-data-cell">${r.teacher.toUpperCase()}</td>`).join('')}${getInvisibleCells()}
                    </tr>
                    <tr>
                        <th class="grad-ngay">NGÀY</th>
                        ${block.map(r => `<td class="fw-bold text-dark text-center evaluation-data-cell">${r.date}</td>`).join('')}${getInvisibleCells()}
                    </tr>
                    <tr>
                        <th class="grad-nd">NỘI DUNG</th>
                        ${block.map(r => `<td class="evaluation-data-cell evaluation-content-cell">${(r.content || '').replace(/tbc:|tbm:/gi, '').trim()}</td>`).join('')}${getInvisibleCells()}
                    </tr>
                    <tr>
                        <th class="grad-nx">NHẬN XÉT</th>
                        ${block.map(r => `<td class="eval-comment-cell evaluation-data-cell">${window.renderCommentHtml(r.comment)}</td>`).join('')}${getInvisibleCells()}
                    </tr>
                </tbody>
            </table>
        </div>`;
    });

    html += `</div>`;

    if (totalPages > 1) {
        html += `<div class="pagination-container evaluation-pagination page-break-avoid">`;
        html += `<button type="button" class="pagination-btn" ${currentPage === 1 ? 'disabled' : `onclick="window.currentPageA2=1; window.renderStandardEvaluationTable();"`}><i class="fas fa-angle-double-left"></i> Đầu</button>`;
        html += `<button type="button" class="pagination-btn" ${currentPage === 1 ? 'disabled' : `onclick="window.currentPageA2=${currentPage - 1}; window.renderStandardEvaluationTable();"`}><i class="fas fa-angle-left"></i> Trước</button>`;

        for (let i = 1; i <= totalPages; i++) {
            html += `<button type="button" class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="window.currentPageA2=${i}; window.renderStandardEvaluationTable();">${i}</button>`;
        }

        html += `<button type="button" class="pagination-btn" ${currentPage === totalPages ? 'disabled' : `onclick="window.currentPageA2=${currentPage + 1}; window.renderStandardEvaluationTable();"`}>Sau <i class="fas fa-angle-right"></i></button>`;
        html += `<button type="button" class="pagination-btn" ${currentPage === totalPages ? 'disabled' : `onclick="window.currentPageA2=${totalPages}; window.renderStandardEvaluationTable();"`}>Cuối <i class="fas fa-angle-double-right"></i></button>`;
        html += `</div>`;
    }

    if (area) area.innerHTML = html;
    window.setEvaluationZoom(window.currentEvaluationZoom || 100);
    window.applyRolePermissions();
};

window.promptEditRecord = () => {
    const data = window.currentA2Data;
    if (!data || data.length === 0) return window.showModal("Không có dữ liệu để sửa!", "error");

    const select = document.getElementById("edit-record-select");
    select.innerHTML = '<option value="">-- Chọn buổi học --</option>';
    data.forEach(r => {
        select.innerHTML += `<option value="${r.id}">Ngày ${r.date} - GV: ${r.teacher}</option>`;
    });

    document.getElementById("edit-record-fields").style.display = "none";
    document.getElementById("editRecordModal").style.display = "flex";
};

window.loadEditRecordData = () => {
    const id = document.getElementById("edit-record-select").value;
    if (!id) {
        document.getElementById("edit-record-fields").style.display = "none";
        return;
    }

    const record = window.currentA2Data.find(r => r.id === id);
    if (record) {
        document.getElementById("edit-record-date").value = record.date || "";
        document.getElementById("edit-record-teacher").value = record.teacher || "";
        document.getElementById("edit-record-content").value = record.content || "";

        document.getElementById("edit-record-comment").value = window.commentToPlainText(record.comment || "");

        document.getElementById("edit-record-fields").style.display = "block";
    }
};

window.saveEditedRecord = async () => {
    const id = document.getElementById("edit-record-select").value;
    const date = document.getElementById("edit-record-date").value.trim();
    const teacher = document.getElementById("edit-record-teacher").value.trim();
    const content = document.getElementById("edit-record-content").value.trim();
    const comment = window.commentPlainTextToHtml(document.getElementById("edit-record-comment").value.trim());

    if (!id || !date || !teacher) return window.showModal("Vui lòng nhập đủ Ngày và Tên GV!", "error");

    try {
        await updateDoc(doc(db, "records", id), {
            date: date,
            teacher: teacher,
            content: content,
            comment: comment
        });
        window.invalidateA2RecordsCache?.();
        window.invalidateDashboardRecordsCache?.();
        await window.markDashboardSummaryForReconcile?.();
        window.showModal("Cập nhật thành công!", "success");
        document.getElementById("editRecordModal").style.display = "none";
        window.renderSoA2Global();
    } catch (e) {
        window.showModal("Lỗi: " + e.message, "error");
    }
};

window.promptDeleteRecord = () => {
    const data = window.currentA2Data;
    if (!data || data.length === 0) return window.showModal("Không có dữ liệu để xóa!", "error");

    const select = document.getElementById("delete-record-select");
    select.innerHTML = '<option value="">-- Chọn buổi học cần xóa --</option>';
    data.forEach(r => {
        select.innerHTML += `<option value="${r.id}">Ngày ${r.date} - GV: ${r.teacher}</option>`;
    });

    document.getElementById("deleteRecordModal").style.display = "flex";
};

window.confirmDeleteRecord = async () => {
    const id = document.getElementById("delete-record-select").value;
    if (!id) return window.showModal("Vui lòng chọn buổi học!", "error");

    try {
        await deleteDoc(doc(db, "records", id));
        window.invalidateA2RecordsCache?.();
        window.invalidateDashboardRecordsCache?.();
        await window.markDashboardSummaryForReconcile?.();
        window.showModal("Đã xóa thành công!", "success");
        document.getElementById("deleteRecordModal").style.display = "none";
        window.renderSoA2Global();
    } catch (e) {
        window.showModal("Lỗi: " + e.message, "error");
    }
};


/* ==========================================
   8. DANH SÁCH HỆ THỐNG
========================================== */

window.importFullExcel = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
        await ensureExcelAssets();
        const snap = await getDocs(collection(db, "records"));
        const existingSet = new Set();
        snap.forEach(d => {
            const r = d.data();
            const sig = `${r.studentName}_${r.className}_${r.facility}_${r.date}_${r.content}_${r.comment}`.trim().toLowerCase();
            existingSet.add(sig);
        });

        const buffer = await file.arrayBuffer();
        const workbook = new window.ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        let newRecords = [];

        const tocSheet = workbook.getWorksheet('MỤC LỌC');
        const sheetMap = {};

        if (tocSheet) {
            let currentFac = "Cơ sở 1";
            tocSheet.eachRow((row, rowNum) => {
                if (rowNum === 1) return;

                const cell = row.getCell(1);
                let text = cell.value ? (cell.value.result || cell.value || '') : '';
                if (typeof text === 'object') text = text.text || text.result || '';
                text = text.toString().trim();

                if (text.startsWith('LỚP ')) {
                    const cls = text.substring(4).trim();
                    let targetSheet = "";
                    if (cell.value && cell.value.formula) {
                        const match = cell.value.formula.match(/HYPERLINK\("#'([^']+)'/);
                        if (match) targetSheet = match[1];
                    }
                    if (targetSheet) {
                        sheetMap[targetSheet] = { fac: currentFac, cls: cls };
                    }
                } else if (text) {
                    currentFac = text;
                }
            });
        }

        workbook.eachSheet((sheet, id) => {
            if (sheet.name === 'MỤC LỌC') return;

            let fac = "Cơ sở 1";
            let cls = sheet.name;

            if (sheetMap[sheet.name]) {
                fac = sheetMap[sheet.name].fac;
                cls = sheetMap[sheet.name].cls;
            } else {
                const sortedFacs = [...window.allFacilities].sort((a, b) => b.length - a.length);
                for (let f of sortedFacs) {
                    if (sheet.name.endsWith(f)) {
                        fac = f;
                        cls = sheet.name.substring(0, sheet.name.length - f.length).trim();
                        break;
                    }
                }
            }

            sheet.eachRow((row, rowNumber) => {
                const col1Val = row.getCell(1).text || '';
                if (col1Val.trim().toUpperCase() === 'TÊN HỌC SINH' || col1Val.trim() === '') {
                    const studentName = row.getCell(2).text || '';
                    if (!studentName || studentName.trim() === 'TÊN HỌC SINH') return;

                    const rowNgay = sheet.getRow(rowNumber + 2);
                    const rowGv = sheet.getRow(rowNumber + 3);
                    const rowNd = sheet.getRow(rowNumber + 4);
                    const rowNx = sheet.getRow(rowNumber + 5);

                    rowNgay.eachCell((cell, colNumber) => {
                        if (colNumber >= 2) {
                            let dateVal = cell.text || '';
                            dateVal = dateVal.trim();

                            if (dateVal.includes('/')) {
                                const gvVal = rowGv.getCell(colNumber).text.trim() || '';
                                const ndVal = rowNd.getCell(colNumber).text.trim() || '';
                                const nxVal = rowNx.getCell(colNumber).text.trim() || '';

                                const sig = `${studentName}_${cls}_${fac}_${dateVal}_${ndVal}_${nxVal}`.trim().toLowerCase();

                                if (!existingSet.has(sig)) {
                                    newRecords.push({
                                        studentName: studentName,
                                        className: cls,
                                        facility: fac,
                                        date: dateVal,
                                        teacher: gvVal,
                                        content: ndVal,
                                        comment: nxVal
                                    });
                                    existingSet.add(sig);
                                }
                            }
                        }
                    });
                }
            });
        });

        if (newRecords.length === 0) {
            document.getElementById('importExcelFile').value = "";
            return window.showModal("Mọi dữ liệu trong file đã có sẵn trên hệ thống.", "info");
        }

        let chunk = 400;
        for (let i = 0; i < newRecords.length; i += chunk) {
            const batch = writeBatch(db);
            const slice = newRecords.slice(i, i + chunk);
            slice.forEach(r => {
                r.timestamp = serverTimestamp();
                batch.set(doc(collection(db, "records")), r);
            });
            await batch.commit();
        }

        window.invalidateA2RecordsCache?.();
        window.invalidateDashboardRecordsCache?.();
        await window.markDashboardSummaryForReconcile?.();

        document.getElementById('importExcelFile').value = "";
        window.showModal("Khôi phục dữ liệu thành công!", "success");
        setTimeout(() => location.reload(), 1500);

    } catch (err) {
        console.error(err);
        document.getElementById('importExcelFile').value = "";
        window.showModal("Lỗi đọc file Excel: " + err.message, "error");
    }
};

window.exportFullExcel = async () => {
    try {
        await ensureExcelAssets();
        const studentsSnap = await getDocs(collection(db, "students"));
        const recordsSnap = await getDocs(collection(db, "records"));

        const classesData = {};
        studentsSnap.forEach(doc => {
            const data = doc.data();
            const fac = data.facility || "Cơ sở 1";
            if (!classesData[fac]) classesData[fac] = {};
            if (!classesData[fac][data.className]) classesData[fac][data.className] = [];
            classesData[fac][data.className].push(data.studentName);
        });

        const recordsData = {};
        recordsSnap.forEach(doc => {
            const data = doc.data();
            const fac = data.facility || "Cơ sở 1";
            const key = `${data.studentName}_${data.className}_${fac}`;
            if (!recordsData[key]) recordsData[key] = [];
            recordsData[key].push(data);
        });

        const workbook = new window.ExcelJS.Workbook();

        const tocSheet = workbook.addWorksheet('MỤC LỌC');
        tocSheet.columns = [{ header: 'DANH SÁCH LỚP', key: 'class', width: 40 }];
        tocSheet.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        tocSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } };
        tocSheet.getRow(1).alignment = { horizontal: 'center' };

        const facilities = Object.keys(classesData).sort();
        let tocRowIdx = 2;

        for (const fac of facilities) {
            const facRow = tocSheet.addRow([fac]);
            facRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF000000' } };
            facRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
            tocRowIdx++;

            const classNames = Object.keys(classesData[fac]).sort();
            for (const className of classNames) {
                let sheetName = `${className} ${fac}`.replace(/[\[\]\*\/\\\?\:\']/g, '').substring(0, 31);

                let sheet;
                try {
                    sheet = workbook.addWorksheet(sheetName);
                } catch (e) {
                    sheetName = `${sheetName.substring(0, 28)}_1`;
                    sheet = workbook.addWorksheet(sheetName);
                }

                const linkRow = tocSheet.addRow([`LỚP ${className}`]);
                linkRow.getCell(1).value = {
                    formula: `HYPERLINK("#'${sheetName}'!A1", "LỚP ${className}")`,
                    result: `LỚP ${className}`
                };
                linkRow.getCell(1).font = { color: { argb: 'FF0563C1' }, underline: true, size: 12 };
                linkRow.getCell(1).alignment = { horizontal: 'left', indent: 2 };
                tocRowIdx++;

                sheet.getColumn(1).width = 25;

                const students = classesData[fac][className].sort((a, b) => a.localeCompare(b, 'vi'));
                let currentRow = 1;

                for (const student of students) {
                    const key = `${student}_${className}_${fac}`;
                    let sRecords = recordsData[key] || [];

                    sRecords.sort((a, b) => window.parseDateVn(a.date) - window.parseDateVn(b.date));

                    const numCols = Math.max(10, sRecords.length + 1);

                    const r1 = sheet.addRow(['TÊN HỌC SINH']);
                    const r2 = sheet.addRow(['THÁNG']);
                    const r3 = sheet.addRow(['NGÀY']);
                    const r4 = sheet.addRow(['TÊN GV']);
                    const r5 = sheet.addRow(['NỘI DUNG']);
                    const r6 = sheet.addRow(['NHẬN XÉT']);

                    r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FFFF' } }; r1.getCell(1).font = { color: { argb: 'FF000000' }, bold: true };
                    r2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008000' } }; r2.getCell(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
                    r3.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } }; r3.getCell(1).font = { bold: true };
                    r4.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EEE0' } }; r4.getCell(1).font = { bold: true };
                    r5.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF98FB98' } }; r5.getCell(1).font = { bold: true };
                    r6.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFAFEEEE' } }; r6.getCell(1).font = { bold: true };

                    r1.getCell(2).value = student;
                    r1.getCell(2).font = { bold: true, size: 12, color: { argb: 'FF000000' } };
                    r1.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FFFF' } };
                    sheet.mergeCells(currentRow, 2, currentRow, numCols);
                    r1.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

                    for (let i = 0; i < numCols - 1; i++) {
                        const rec = sRecords[i];
                        const col = i + 2;

                        if (rec) {
                            let m = "";
                            if (rec.date) {
                                const parts = rec.date.split('/');
                                if (parts.length >= 2) {
                                    m = `THÁNG ${parts[1].padStart(2, '0')}`;
                                }
                            }

                            r2.getCell(col).value = m;
                            r3.getCell(col).value = rec.date;
                            r4.getCell(col).value = rec.teacher;

                            const cleanNd = (rec.content || '').replace(/tbc:|tbm:/gi, '').trim();
                            const cleanNx = window.commentToPlainText(rec.comment || "");

                            r5.getCell(col).value = cleanNd;
                            r6.getCell(col).value = cleanNx;
                            r6.getCell(col).font = { color: { argb: 'FFFF0000' } };
                            r6.getCell(col).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
                        }

                        r2.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FFFF' } };
                        r2.getCell(col).font = { bold: true };

                        sheet.getColumn(col).width = 20;
                    }

                    r5.height = 35;
                    r6.height = 50;

                    for (let r = currentRow; r <= currentRow + 5; r++) {
                        const rowObj = sheet.getRow(r);
                        for (let c = 1; c <= numCols; c++) {
                            const cell = rowObj.getCell(c);
                            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                        }
                    }

                    currentRow += 6;
                }
            }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        window.saveAs(new Blob([buffer]), `DuLieu_ToanHeThong_${Date.now()}.xlsx`);

        window.closeModal();
        window.showModal("Xuất file Excel thành công!", "success");

    } catch (err) {
        console.error(err);
        window.showModal("Lỗi xuất Excel: " + err.message, "error");
    }
};

/* ==========================================
   10. XUẤT PHIẾU ĐÁNH GIÁ (ZALO & IN)
========================================== */
window.initAppStateListeners();
window.bootstrapCachedSession();
window.initPromise = init();
window.initMobileBottomNavKeyboardFix();
