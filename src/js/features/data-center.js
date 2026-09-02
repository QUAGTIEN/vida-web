import {
    collection,
    doc,
    getDocs,
    limit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    startAfter,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { auth, db } from "../config/firebase.js?v=20260826-data-center-2";

const HISTORY_RECORD_PAGE_SIZE = 40;
const DELETE_BATCH_SIZE = 400;
const DATA_CENTER_VERSION = "20260826-data-center-2";
const HISTORY_RANGES = {
    "24h": { hours: 24, label: "24 giờ qua" },
    "3d": { hours: 72, label: "3 ngày qua" },
    "7d": { hours: 168, label: "7 ngày qua" }
};

const state = {
    historyInitialized: false,
    activeView: "history",
    historyItems: [],
    historyCursor: null,
    historyHasMore: false,
    historyLoading: false,
    cleanupGroups: [],
    cleanupPlan: null,
    cleanupScanned: false,
    cleanupLoading: false
};

const escapeHtml = value => window.escapeHtml?.(String(value ?? ""))
    ?? String(value ?? "").replace(/[&<>'"]/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[char]));

const clampNumber = (value, minimum, maximum, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
};

const getTimestampMs = record => {
    if (!record) return 0;
    if (typeof window.getRecordTimestampMs === "function") {
        const timestamp = Number(window.getRecordTimestampMs(record));
        if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
    }
    for (const value of [record.savedAt, record.timestamp, record.updatedAt, record.createdAt]) {
        if (typeof value?.toMillis === "function") return value.toMillis();
        if (value instanceof Date) return value.getTime();
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string") {
            const parsed = Date.parse(value);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    const dateValue = String(record.lessonDate || record.date || "");
    const match = dateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime();
    return 0;
};

const formatDateTime = timestampMs => {
    if (!timestampMs) return { date: "Không rõ ngày", time: "--:--" };
    const value = new Date(timestampMs);
    return {
        date: value.toLocaleDateString("vi-VN"),
        time: value.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    };
};

const getSelectedHistoryRange = () => {
    const selectedValue = document.getElementById("data-history-range")?.value || "24h";
    const selectedRange = HISTORY_RANGES[selectedValue] || HISTORY_RANGES["24h"];
    const end = new Date();
    const start = new Date(end.getTime() - selectedRange.hours * 60 * 60 * 1000);
    return { start, end, value: selectedValue, label: selectedRange.label };
};

const requireAdmin = () => {
    if (window.currentRole !== "admin" || !auth.currentUser) {
        window.showModal?.("Chức năng này chỉ dành cho tài khoản quản lý đã đăng nhập.", "error");
        return false;
    }
    return true;
};

const setHistoryStatus = text => {
    const element = document.getElementById("data-history-status");
    if (element) element.textContent = text;
};

const getRecordHistoryKey = record => {
    if (record.batchId) return `batch:${record.batchId}`;
    const minuteBucket = Math.floor(record.savedAtMs / 60000);
    return [
        "legacy",
        record.teacher,
        record.facility,
        record.className,
        record.lessonDate,
        record.shift,
        minuteBucket
    ].map(value => String(value || "").trim().toLocaleLowerCase("vi")).join("|");
};

const normalizeHistoryRecordSnapshot = snapshot => {
    const data = snapshot.data() || {};
    const record = {
        id: snapshot.id,
        savedAtMs: getTimestampMs(data),
        teacher: data.teacher || data.teacherName || "Chưa rõ",
        facility: data.facility || "Chưa rõ cơ sở",
        className: data.className || data.class || "Chưa rõ lớp",
        studentName: data.studentName || "Không rõ học sinh",
        lessonDate: data.date || data.lessonDate || "",
        shift: data.shift || "",
        batchId: data.batchId || ""
    };
    return { ...record, historyKey: getRecordHistoryKey(record) };
};

const mergeHistoryItems = items => {
    const unique = new Map();
    items.forEach(item => {
        if (!unique.has(item.id)) unique.set(item.id, item);
    });
    return [...unique.values()].sort((a, b) => b.savedAtMs - a.savedAtMs);
};

const groupHistoryRecords = records => {
    const groups = new Map();
    records.forEach(record => {
        const key = record.historyKey;
        if (!groups.has(key)) {
            groups.set(key, {
                id: key,
                savedAtMs: record.savedAtMs,
                teacher: record.teacher,
                facility: record.facility,
                className: record.className,
                studentNames: new Set(),
                recordIds: new Set(),
                batchId: record.batchId || key,
                source: record.batchId ? "batch" : "legacy"
            });
        }
        const group = groups.get(key);
        group.savedAtMs = Math.max(group.savedAtMs, record.savedAtMs);
        group.recordIds.add(record.id);
        if (record.studentName) group.studentNames.add(record.studentName);
    });
    return [...groups.values()].map(group => ({
        ...group,
        studentCount: group.recordIds.size,
        studentNames: [...group.studentNames]
    })).sort((a, b) => b.savedAtMs - a.savedAtMs);
};

const updateHistoryLoadMoreButton = () => {
    const button = document.getElementById("data-history-more");
    if (!button) return;
    button.hidden = false;
    button.disabled = state.historyLoading || !state.historyHasMore;
    button.textContent = state.historyLoading
        ? "Đang tải..."
        : state.historyHasMore ? "Tải thêm" : "Đã hiển thị hết";
};

window.loadDataHistory = async (reset = true) => {
    if (!requireAdmin() || state.historyLoading) return;
    if (reset) state.historyInitialized = true;
    state.historyLoading = true;
    const rangeSelect = document.getElementById("data-history-range");
    if (rangeSelect) rangeSelect.disabled = true;
    updateHistoryLoadMoreButton();
    if (reset) {
        state.historyItems = [];
        state.historyCursor = null;
        state.historyHasMore = false;
        const list = document.getElementById("data-history-list");
        if (list) list.innerHTML = `<tr class="data-empty-row"><td colspan="5">Đang tải nhật ký ghi dữ liệu...</td></tr>`;
        setHistoryStatus(`Đang tải ${getSelectedHistoryRange().label}...`);
    }

    try {
        const range = getSelectedHistoryRange();
        const constraints = [
            where("timestamp", ">=", range.start),
            orderBy("timestamp", "desc"),
            limit(HISTORY_RECORD_PAGE_SIZE + 1)
        ];
        if (!reset && state.historyCursor) constraints.splice(2, 0, startAfter(state.historyCursor));

        const snapshot = await getDocs(query(collection(db, "records"), ...constraints));
        const documents = snapshot.docs;
        const visibleDocuments = documents.slice(0, HISTORY_RECORD_PAGE_SIZE);
        const items = visibleDocuments.map(normalizeHistoryRecordSnapshot);

        state.historyItems = reset ? items : mergeHistoryItems([...state.historyItems, ...items]);
        state.historyCursor = visibleDocuments.at(-1) || state.historyCursor;
        state.historyHasMore = documents.length > HISTORY_RECORD_PAGE_SIZE;
        window.renderDataHistory();
    } catch (error) {
        console.error("[data-center] Không thể tải lịch sử:", error);
        if (reset) {
            const list = document.getElementById("data-history-list");
            if (list) list.innerHTML = `<tr class="data-empty-row"><td colspan="5">Không thể tải nhật ký ghi dữ liệu. Vui lòng thử lại.</td></tr>`;
            setHistoryStatus("Không thể tải lịch sử từ records.");
        }
    } finally {
        state.historyLoading = false;
        if (rangeSelect) rangeSelect.disabled = false;
        updateHistoryLoadMoreButton();
    }
};

window.changeDataHistoryRange = () => {
    state.historyInitialized = false;
    window.loadDataHistory(true);
};

const getFilteredHistory = () => {
    const search = (document.getElementById("data-history-search")?.value || "").trim().toLocaleLowerCase("vi");
    const facility = document.getElementById("data-history-facility")?.value || "";
    return groupHistoryRecords(state.historyItems).filter(item => {
        const searchable = `${item.teacher} ${item.facility} ${item.className} ${(item.studentNames || []).join(" ")}`
            .toLocaleLowerCase("vi");
        return (!search || searchable.includes(search)) && (!facility || item.facility === facility);
    });
};

const updateHistoryFacilityOptions = () => {
    const select = document.getElementById("data-history-facility");
    if (!select) return;
    const currentValue = select.value;
    const facilities = [...new Set([
        ...(Array.isArray(window.allFacilities) ? window.allFacilities : []),
        ...state.historyItems.map(item => item.facility)
    ].filter(facility => facility && facility !== "Chưa rõ cơ sở"))]
        .sort((a, b) => a.localeCompare(b, "vi"));
    select.innerHTML = `<option value="">Tất cả cơ sở</option>${facilities.map(facility => (
        `<option value="${escapeHtml(facility)}">${escapeHtml(facility)}</option>`
    )).join("")}`;
    if (facilities.includes(currentValue)) select.value = currentValue;
};

window.renderDataHistory = () => {
    const list = document.getElementById("data-history-list");
    if (!list) return;
    updateHistoryFacilityOptions();
    const items = getFilteredHistory().sort((a, b) => b.savedAtMs - a.savedAtMs);

    list.innerHTML = items.length ? items.map(item => {
        const savedAt = formatDateTime(item.savedAtMs);
        const names = item.studentNames?.length ? ` title="${escapeHtml(item.studentNames.join(", "))}"` : "";
        return `<tr>
            <td><strong>${escapeHtml(savedAt.date)}</strong><span>${escapeHtml(savedAt.time)}</span></td>
            <td>${escapeHtml(item.teacher)}</td>
            <td><strong>${escapeHtml(item.facility)}</strong><span>${escapeHtml(item.className)}</span></td>
            <td><span class="data-count-badge"${names}>${item.studentCount}</span></td>
            <td><span class="data-status-badge">Đã ghi DB</span></td>
        </tr>`;
    }).join("") : `<tr class="data-empty-row"><td colspan="5">Không có lượt ghi thành công trong ${escapeHtml(getSelectedHistoryRange().label)}.</td></tr>`;

    updateHistoryLoadMoreButton();
    const allGroups = groupHistoryRecords(state.historyItems);
    setHistoryStatus(`${items.length}/${allGroups.length} lượt lưu · ${state.historyItems.length} phiếu đã đọc · ${getSelectedHistoryRange().label}`);
};

const getStudentGroupKey = data => {
    const studentId = String(data.studentId || "").trim();
    const contextKey = [data.facility, data.className]
        .map(value => String(value || "").trim().toLocaleLowerCase("vi"))
        .join("|");
    if (studentId) return `id:${studentId}|${contextKey}`;
    return `name:${contextKey}|${String(data.studentName || "").trim().toLocaleLowerCase("vi")}`;
};

window.scanDataCleanup = async () => {
    if (!requireAdmin() || state.cleanupLoading) return;
    state.cleanupLoading = true;
    state.cleanupPlan = null;
    const button = document.getElementById("data-cleanup-scan");
    const summary = document.getElementById("data-cleanup-summary");
    if (button) {
        button.disabled = true;
        button.textContent = "Đang rà soát...";
    }
    if (summary) summary.textContent = "Đang đọc dữ liệu phiếu để nhóm theo học sinh. Vui lòng giữ trang này mở...";

    try {
        const snapshot = await getDocs(collection(db, "records"));
        const groups = new Map();
        snapshot.forEach(recordSnapshot => {
            const data = recordSnapshot.data() || {};
            const key = getStudentGroupKey(data);
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    studentId: data.studentId || "",
                    studentName: data.studentName || "Không rõ học sinh",
                    facility: data.facility || "Chưa rõ cơ sở",
                    className: data.className || "Chưa rõ lớp",
                    records: []
                });
            }
            groups.get(key).records.push({ id: recordSnapshot.id, data, timestampMs: getTimestampMs(data) });
        });
        state.cleanupGroups = [...groups.values()].map(group => ({
            ...group,
            records: group.records.sort((a, b) => b.timestampMs - a.timestampMs)
        })).sort((a, b) => b.records.length - a.records.length);
        state.cleanupScanned = true;
        window.renderCleanupInventory();
    } catch (error) {
        console.error("[data-center] Rà soát thất bại:", error);
        if (summary) summary.textContent = "Không thể rà soát dữ liệu. Vui lòng kiểm tra quyền truy cập và thử lại.";
        window.showModal?.("Không thể rà soát dữ liệu: " + (error.message || "Lỗi không xác định"), "error");
    } finally {
        state.cleanupLoading = false;
        if (button) {
            button.disabled = false;
            button.textContent = "Rà soát lại";
        }
    }
};

const getCleanupCandidates = () => {
    const threshold = clampNumber(document.getElementById("data-cleanup-threshold")?.value, 2, 9999, 50);
    return state.cleanupGroups.filter(group => group.records.length >= threshold);
};

window.renderCleanupInventory = () => {
    const list = document.getElementById("data-cleanup-list");
    const summary = document.getElementById("data-cleanup-summary");
    const startButton = document.getElementById("data-cleanup-start");
    if (!list || !summary) return;
    state.cleanupPlan = null;
    if (startButton) startButton.disabled = true;

    if (!state.cleanupScanned) {
        list.innerHTML = `<tr class="data-empty-row"><td colspan="6">Bấm “Bắt đầu rà soát” để phân tích dữ liệu.</td></tr>`;
        summary.textContent = "Chưa rà soát dữ liệu. Hệ thống sẽ không tự động xóa bất kỳ phiếu nào.";
        return;
    }

    const candidates = getCleanupCandidates();
    const threshold = Math.round(clampNumber(document.getElementById("data-cleanup-threshold")?.value, 2, 9999, 50));
    const totalRecords = state.cleanupGroups.reduce((sum, group) => sum + group.records.length, 0);
    summary.innerHTML = `<strong>${candidates.length} học sinh</strong> có từ ${threshold.toLocaleString("vi-VN")} phiếu · Tổng dữ liệu đã rà soát: ${totalRecords.toLocaleString("vi-VN")} phiếu.`;
    list.innerHTML = candidates.length ? candidates.map(group => {
        const oldest = group.records.at(-1)?.timestampMs || 0;
        const risk = group.records.length >= 150 ? "Cần ưu tiên" : "Nên rà soát";
        const riskClass = group.records.length >= 150 ? "risk-high" : "risk-medium";
        return `<tr>
            <td><input type="checkbox" class="data-cleanup-checkbox" data-cleanup-key="${escapeHtml(group.key)}" onchange="window.updateCleanupSelection()" aria-label="Chọn ${escapeHtml(group.studentName)}"></td>
            <td><button type="button" class="data-student-link" data-cleanup-key="${escapeHtml(group.key)}" onclick="window.openCleanupStudentEvaluation(this.dataset.cleanupKey)">${escapeHtml(group.studentName)}</button>${group.studentId ? `<span>Mã: ${escapeHtml(group.studentId)}</span>` : ""}</td>
            <td><strong>${escapeHtml(group.facility)}</strong><span>${escapeHtml(group.className)}</span></td>
            <td><span class="data-count-badge">${group.records.length}</span></td>
            <td>${escapeHtml(formatDateTime(oldest).date)}</td>
            <td><span class="data-risk-badge ${riskClass}">${risk}</span></td>
        </tr>`;
    }).join("") : `<tr class="data-empty-row"><td colspan="6">Không có học sinh nào vượt ngưỡng đã chọn.</td></tr>`;

    const selectAll = document.getElementById("data-cleanup-select-all");
    if (selectAll) selectAll.checked = false;
    const title = document.getElementById("data-cleanup-plan-title");
    const detail = document.getElementById("data-cleanup-plan-detail");
    if (title) title.textContent = "Chưa chọn học sinh";
    if (detail) detail.textContent = "Chọn học sinh cần xử lý, sau đó bấm “Dọn dẹp đã chọn”.";
};

window.toggleAllCleanupStudents = checked => {
    document.querySelectorAll(".data-cleanup-checkbox").forEach(input => {
        input.checked = Boolean(checked);
    });
    window.updateCleanupSelection();
};

window.updateCleanupSelection = () => {
    state.cleanupPlan = null;
    const selectedCount = document.querySelectorAll(".data-cleanup-checkbox:checked").length;
    const title = document.getElementById("data-cleanup-plan-title");
    const detail = document.getElementById("data-cleanup-plan-detail");
    const startButton = document.getElementById("data-cleanup-start");
    if (title) title.textContent = selectedCount ? `Đã chọn ${selectedCount} học sinh` : "Chưa chọn học sinh";
    if (detail) detail.textContent = selectedCount
        ? "Bấm “Dọn dẹp đã chọn” để nhập số phiếu mới nhất cần giữ lại."
        : "Chọn học sinh cần xử lý, sau đó bấm “Dọn dẹp đã chọn”.";
    if (startButton) startButton.disabled = selectedCount === 0;
};

window.openCleanupStudentEvaluation = cleanupKey => {
    const group = state.cleanupGroups.find(item => item.key === cleanupKey);
    if (!group) return;
    window.switchTab?.("quan-ly");
    window.viewStudentFromFilter?.(
        group.studentName,
        group.className,
        group.studentId || "",
        group.facility || "",
        window.classCategoryMap?.[group.className] || ""
    );
};

const prepareCleanupPlan = keepCount => {
    if (!requireAdmin() || !state.cleanupScanned) return;
    const selectedKeys = new Set([...document.querySelectorAll(".data-cleanup-checkbox:checked")]
        .map(input => input.dataset.cleanupKey));
    if (!selectedKeys.size) return window.showModal?.("Vui lòng chọn ít nhất một học sinh cần rà soát.", "info");

    const selectedGroups = state.cleanupGroups.filter(group => selectedKeys.has(group.key));
    const deletions = selectedGroups.flatMap(group => group.records.slice(keepCount).map(record => ({
        ...record,
        studentKey: group.key,
        studentName: group.studentName
    })));

    state.cleanupPlan = {
        createdAt: Date.now(),
        keepCount,
        selectedGroups,
        deletions
    };
    const title = document.getElementById("data-cleanup-plan-title");
    const detail = document.getElementById("data-cleanup-plan-detail");
    if (title) title.textContent = `${deletions.length.toLocaleString("vi-VN")} phiếu sẽ được xóa`;
    if (detail) detail.textContent = `Giữ lại ${keepCount} phiếu mới nhất cho mỗi học sinh đã chọn.`;
    if (!deletions.length) {
        window.showModal?.("Không có phiếu nào cần xóa vì số phiếu giữ lại đã bằng hoặc lớn hơn dữ liệu hiện có.", "info");
        return;
    }

    window.showModal?.(
        `Hệ thống sẽ giữ lại <b>${keepCount} phiếu mới nhất</b> cho mỗi học sinh và xóa <b>${deletions.length.toLocaleString("vi-VN")} phiếu cũ</b> của ${selectedGroups.length} học sinh.<br><br>Nhật ký ai đã lưu và thời điểm lưu vẫn được giữ. Thao tác xóa không thể hoàn tác.`,
        "confirm",
        executeCleanupPlan
    );
};

window.startSelectedDataCleanup = () => {
    if (!requireAdmin() || !state.cleanupScanned) return;
    const selectedKeys = new Set([...document.querySelectorAll(".data-cleanup-checkbox:checked")]
        .map(input => input.dataset.cleanupKey));
    const selectedGroups = state.cleanupGroups.filter(group => selectedKeys.has(group.key));
    if (!selectedGroups.length) return window.showModal?.("Vui lòng chọn ít nhất một học sinh cần dọn dẹp.", "info");
    const smallestRecordCount = Math.min(...selectedGroups.map(group => group.records.length));
    const suggestedKeepCount = Math.max(1, Math.min(30, smallestRecordCount - 1));
    window.showModal?.(
        `Nhập số phiếu <b>mới nhất cần giữ lại</b> cho mỗi học sinh đã chọn:`,
        "prompt",
        rawValue => {
            const keepCount = Number(rawValue);
            if (!Number.isInteger(keepCount) || keepCount < 1) {
                return window.showModal?.("Số phiếu giữ lại phải là số nguyên lớn hơn hoặc bằng 1.", "error");
            }
            prepareCleanupPlan(keepCount);
        },
        String(suggestedKeepCount),
        { placeholder: "Số phiếu cần giữ lại" }
    );
};

const executeCleanupPlan = async () => {
    const plan = state.cleanupPlan;
    if (!plan?.deletions?.length || !requireAdmin()) return;
    const startButton = document.getElementById("data-cleanup-start");
    if (startButton) {
        startButton.disabled = true;
        startButton.textContent = "Đang dọn dẹp...";
    }
    const jobRef = doc(collection(db, "cleanup_jobs"));
    const user = auth.currentUser;
    const jobPayload = {
        status: "running",
        appVersion: DATA_CENTER_VERSION,
        createdAt: serverTimestamp(),
        createdByUid: user?.uid || "",
        createdByEmail: user?.email || "",
        keepCount: plan.keepCount,
        targetRecordCount: plan.deletions.length,
        affectedStudentCount: plan.selectedGroups.length,
        students: plan.selectedGroups.slice(0, 100).map(group => ({
            studentId: group.studentId || "",
            studentName: group.studentName,
            facility: group.facility,
            className: group.className,
            recordCountBefore: group.records.length
        }))
    };
    let deletedRecordCount = 0;

    try {
        await setDoc(jobRef, jobPayload);
        for (let offset = 0; offset < plan.deletions.length; offset += DELETE_BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = plan.deletions.slice(offset, offset + DELETE_BATCH_SIZE);
            chunk
                .forEach(record => batch.delete(doc(db, "records", record.id)));
            await batch.commit();
            deletedRecordCount += chunk.length;
            await setDoc(jobRef, {
                deletedRecordCount,
                progressUpdatedAt: serverTimestamp()
            }, { merge: true });
        }
        await setDoc(jobRef, {
            status: "completed",
            completedAt: serverTimestamp(),
            deletedRecordCount
        }, { merge: true });

        const deletedIds = new Set(plan.deletions.map(record => record.id));
        state.cleanupGroups = state.cleanupGroups.map(group => ({
            ...group,
            records: group.records.filter(record => !deletedIds.has(record.id))
        }));
        window.invalidateA2RecordsCache?.();
        window.invalidateDashboardRecordsCache?.();
        window.renderCleanupInventory();
        window.showModal?.(`Đã xóa ${plan.deletions.length.toLocaleString("vi-VN")} phiếu cũ. Nhật ký lượt lưu vẫn được giữ để đối soát.`, "success");
    } catch (error) {
        console.error("[data-center] Dọn dẹp thất bại:", error);
        await setDoc(jobRef, {
            status: deletedRecordCount > 0 ? "partially_failed" : "failed",
            failedAt: serverTimestamp(),
            deletedRecordCount,
            error: String(error?.message || error).slice(0, 500)
        }, { merge: true }).catch(() => {});
        window.showModal?.("Dọn dẹp chưa hoàn tất: " + (error.message || "Lỗi không xác định"), "error");
    } finally {
        if (startButton) {
            startButton.disabled = true;
            startButton.textContent = "Dọn dẹp đã chọn";
        }
    }
};

window.switchDataCenterView = view => {
    const selectedView = ["history", "cleanup"].includes(view) ? view : "history";
    state.activeView = selectedView;
    document.querySelectorAll(".data-center-tab").forEach(button => {
        const active = button.dataset.dataView === selectedView;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".data-center-view").forEach(panel => {
        const active = panel.id === `data-view-${selectedView}`;
        panel.classList.toggle("active", active);
        panel.hidden = !active;
    });

    if (selectedView === "history" && !state.historyInitialized) {
        window.loadDataHistory(true);
    }
};

window.openDataCenter = () => {
    if (!requireAdmin()) return;
    window.switchDataCenterView(state.activeView || "history");
};
