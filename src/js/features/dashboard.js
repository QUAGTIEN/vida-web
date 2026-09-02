import { ensureChartJs } from "../core/lazy-assets.js";

window.toThongKeDocId = (facilityName) => {
    const text = String(facilityName || "").trim();
    const upperRaw = text.toUpperCase().replace(/\s+/g, '');
    const FACILITY_DOC_MAP = {
        CS1: "CoSo1",
        CS2: "CoSo2",
        CS3: "CoSo3",
        CS4: "CoSo4",
        COSO1: "CoSo1",
        COSO2: "CoSo2",
        COSO3: "CoSo3",
        COSO4: "CoSo4"
    };
    if (FACILITY_DOC_MAP[upperRaw]) return FACILITY_DOC_MAP[upperRaw];

    const numberMatch = upperRaw.match(/\d+/);
    if (numberMatch) return `CoSo${numberMatch[0]}`;

    const normalized = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '');
    const normalizedUpper = normalized.toUpperCase();
    if (FACILITY_DOC_MAP[normalizedUpper]) return FACILITY_DOC_MAP[normalizedUpper];
    return "CoSo1";
};

window.renderDashboardFacilityCards = () => {
    const container = document.getElementById("dashboard-facilities");
    if (!container) return;

    if (window.allFacilities.length === 0) {
        container.innerHTML = '<div class="dashboard-facility-empty">Chưa có dữ liệu cơ sở nào.</div>';
        return;
    }

    const menuItems = window.allFacilities.map((facility, index) => {
        const label = window.escapeHtml(String(facility || `CS${index + 1}`).replace(/Cơ sở\s*/gi, 'CS').toUpperCase());
        return `
            <button type="button" class="dashboard-facility-option" data-facility-index="${index}" role="menuitem">
                <span>${label}</span>
            </button>`;
    }).join('');

    container.innerHTML = `
        <button type="button" class="dashboard-facility-trigger" id="dashboard-facility-trigger"
            aria-expanded="false" aria-controls="dashboard-facility-menu">
            <span class="dashboard-facility-trigger-copy">
                <small>Cơ sở</small>
                <strong>${window.allFacilities.length} cơ sở</strong>
            </span>
        </button>
        <div class="dashboard-facility-menu" id="dashboard-facility-menu" role="menu" hidden>
            ${menuItems}
        </div>`;
};

window.loadDashboardFacilitiesOverview = async (recordsList, attendanceSummary = null) => {
    window.renderDashboardFacilityCards();

    const ctx = document.getElementById('attendanceChart');
    if (ctx) {
        try {
            await ensureChartJs();
        } catch (error) {
            console.error("Không thể tải thư viện biểu đồ:", error);
            return;
        }
    }
    if (ctx && window.Chart) {
        const labels = [];
        const dateMap = {};
        const dateEntries = window.getDashboardDateEntries();
        dateEntries.forEach(entry => {
            labels.push(entry.label);
            dateMap[entry.label] = {};
            window.allFacilities.forEach(facility => {
                const facilityCode = window.getFacilityCode(facility);
                dateMap[entry.label][facility] = Number(attendanceSummary?.counts?.[entry.key]?.[facilityCode] || 0);
            });
        });

        if (!attendanceSummary && recordsList && recordsList.length > 0) {
            recordsList.forEach(doc => {
                let label = "";
                if (doc.date) {
                    let parts = doc.date.split('/');
                    if (parts.length >= 2) {
                        label = `${parts[0]}/${parts[1]}`;
                    }
                } else {
                    const timestampMs = window.getRecordTimestampMs(doc);
                    if (timestampMs <= 0) return;
                    let d = new Date(timestampMs);
                    let dd = String(d.getDate()).padStart(2, '0');
                    let mm = String(d.getMonth() + 1).padStart(2, '0');
                    label = `${dd}/${mm}`;
                }

                if (label && dateMap[label] !== undefined) {
                    let matchedFac = window.allFacilities.find(f => f.toUpperCase() === (doc.facility || '').toUpperCase());
                    if (matchedFac && dateMap[label][matchedFac] !== undefined) {
                        dateMap[label][matchedFac]++;
                    }
                }
            });
        }

        const colors = ['#10b981', '#3b82f6', '#f43f5e', '#f59e0b', '#8b5cf6'];
        const datasets = window.allFacilities.map((fac, index) => {
            return {
                label: fac,
                data: labels.map(l => dateMap[l][fac]),
                backgroundColor: colors[index % colors.length],
                borderRadius: 4,
                barPercentage: 0.8,
                categoryPercentage: 0.7
            };
        });

        let chartStatus = window.Chart.getChart("attendanceChart");
        if (chartStatus) chartStatus.destroy();

        new window.Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { color: '#fff', usePointStyle: true, boxWidth: 10 } },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#cbd5e1',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 10
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#fff' },
                        stacked: false
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, color: '#fff', precision: 0 },
                        grid: { color: '#334155', borderDash: [4, 4] },
                        stacked: false
                    }
                }
            }
        });
    }
};

const DASHBOARD_HISTORY_VISIBLE_STEP = 8;
const DASHBOARD_NEWS_CATEGORIES = ['attention', 'crowded', 'late', 'recent'];

window.dashboardActiveNewsCategory = window.dashboardActiveNewsCategory || 'attention';
window.dashboardNewsGroups = window.dashboardNewsGroups || {};
window.dashboardHistoryItems = window.dashboardHistoryItems || [];
window.dashboardHistoryRecords = window.dashboardHistoryRecords || [];
window.dashboardHistoryHasMore = false;
window.dashboardHistoryLoading = false;
window.dashboardHistoryVisibleCount = window.dashboardHistoryVisibleCount || DASHBOARD_HISTORY_VISIBLE_STEP;
window.dashboardHistoryRange = window.dashboardHistoryRange || { rangeStartMs: 0, rangeEndMs: 0 };
window.dashboardHistoryFilterApplied = window.dashboardHistoryFilterApplied || false;

window.getDashboardHistoryRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - 6);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return { rangeStartMs: start.getTime(), rangeEndMs: end.getTime() };
};

window.loadDashboardHistory = async () => {
    if (window.dashboardHistoryLoading) return;
    const range = window.getDashboardHistoryRange();

    const list = document.getElementById('dashboard-history-list');
    const total = document.getElementById('dashboard-history-total');
    const loadMore = document.getElementById('dashboard-history-load-more');
    const endMessage = document.getElementById('dashboard-history-end');
    window.dashboardHistoryLoading = true;
    if (list) list.innerHTML = '<tr class="dashboard-history-empty"><td colspan="4">Đang tải lịch sử...</td></tr>';
    if (total) total.textContent = '7 ngày gần nhất';
    if (loadMore) loadMore.hidden = true;
    if (endMessage) endMessage.hidden = true;

    try {
        const records = await window.fetchDashboardHistoryRecordsPage(0, range);
        window.dashboardHistoryRange = range;
        window.dashboardHistoryRecords = records;
        window.dashboardHistoryHasMore = records.length >= Number(window.dashboardRecordsPageLimit || 50);
        window.dashboardHistoryItems = window.buildDashboardHistoryItems(records);
        window.dashboardHistoryVisibleCount = DASHBOARD_HISTORY_VISIBLE_STEP;
        window.dashboardHistoryFilterApplied = true;
        window.renderDashboardHistory();
    } catch (error) {
        console.error('[dashboard history] load failed:', error);
        window.dashboardHistoryRecords = [];
        window.dashboardHistoryItems = [];
        window.dashboardHistoryHasMore = false;
        if (list) list.innerHTML = '<tr class="dashboard-history-empty"><td colspan="4">Không thể tải lịch sử. Vui lòng thử lại.</td></tr>';
        if (total) total.textContent = '7 ngày gần nhất';
    } finally {
        window.dashboardHistoryLoading = false;
        if (loadMore) loadMore.disabled = false;
    }
};

window.buildDashboardHistoryItems = (records = []) => {
    const batches = {};
    records.forEach(record => {
        const timestamp = window.getRecordTimestampMs(record) || window.parseDateVn(record.date);
        const minuteBucket = Math.floor(timestamp / 60000);
        const key = record.batchId || `${record.className}|${record.facility}|${record.teacher}|${record.date}|${minuteBucket}`;
        if (!batches[key]) {
            batches[key] = {
                records: [],
                teacher: record.teacher,
                className: record.className,
                facility: record.facility,
                date: record.date,
                latestTimestamp: 0
            };
        }
        batches[key].records.push(record);
        batches[key].latestTimestamp = Math.max(batches[key].latestTimestamp, timestamp);
    });

    return Object.values(batches)
        .map(batch => {
            const submittedAt = new Date(batch.latestTimestamp || window.parseDateVn(batch.date));
            return {
                teacher: batch.teacher,
                className: batch.className,
                facility: batch.facility,
                date: batch.date,
                timestamp: submittedAt.getTime(),
                timeLabel: submittedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                studentCount: batch.records.length
            };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
};

window.renderDashboardNewsCategory = (category = window.dashboardActiveNewsCategory) => {
    const safeCategory = DASHBOARD_NEWS_CATEGORIES.includes(category) ? category : 'attention';
    const items = window.dashboardNewsGroups?.[safeCategory] || [];
    const container = document.getElementById('news-feed-container');
    window.dashboardActiveNewsCategory = safeCategory;

    let activeTab = null;
    document.querySelectorAll('.dashboard-news-tab').forEach(tab => {
        const isActive = tab.dataset.newsCategory === safeCategory;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
        if (isActive) activeTab = tab;
    });

    const tabsContainer = activeTab?.closest('.dashboard-news-tabs');
    if (tabsContainer && tabsContainer.scrollWidth > tabsContainer.clientWidth) {
        const targetLeft = activeTab.offsetLeft - ((tabsContainer.clientWidth - activeTab.offsetWidth) / 2);
        tabsContainer.scrollTo({
            left: Math.max(0, targetLeft),
            behavior: 'smooth'
        });
    }

    if (!container) return;
    window.dashboardNewsItems = items.slice(0, 30);
    if (window.dashboardNewsItems.length === 0) {
        container.innerHTML = '<div class="news-empty-state"><span>Không có thông tin trong nhóm này.</span></div>';
        return;
    }

    container.innerHTML = window.dashboardNewsItems.map((news, newsIndex) => {
        const iconTone = ['warning', 'danger', 'info', 'success'].includes(news.type) ? news.type : 'default';
        const lateBadge = news.isLate ? '<span class="news-late-badge">BÁO TRỄ</span>' : '';
        const isActionable = !!news.studentTarget?.name && !!news.studentTarget?.className;
        const itemClass = `news-item news-item-${iconTone}${isActionable ? ' news-item-actionable' : ''}`;
        const itemAttrs = isActionable
            ? `data-news-index="${newsIndex}" role="button" tabindex="0" aria-label="Mở phiếu đánh giá của ${window.escapeHtml(news.studentTarget.name)}"`
            : '';
        return `
            <div class="${itemClass}" ${itemAttrs}>
                <div class="news-content">
                    <div class="news-title">${window.escapeHtml(news.title)}${lateBadge}</div>
                    <p class="news-desc">${window.escapeHtml(news.desc)}</p>
                    ${news.detail ? `<p class="news-detail">${window.escapeHtml(news.detail)}</p>` : ''}
                    <span class="news-time">${window.getTimeAgo(new Date(news.time))}</span>
                </div>
            </div>`;
    }).join('');
    window.initNewsSwipe?.();
};

window.renderDashboardHistory = () => {
    const list = document.getElementById('dashboard-history-list');
    if (!list) return;

    const items = window.dashboardHistoryItems || [];
    const requestedCount = Math.max(Number(window.dashboardHistoryVisibleCount) || 0, DASHBOARD_HISTORY_VISIBLE_STEP);
    const visibleCount = Math.min(requestedCount, items.length);
    const visibleItems = items.slice(0, visibleCount);
    window.dashboardHistoryVisibleCount = requestedCount;

    list.innerHTML = visibleItems.length > 0
        ? visibleItems.map(item => `
            <tr>
                <td>
                    <strong class="dashboard-history-date">${window.escapeHtml(item.date || 'Chưa cập nhật')}</strong>
                    <small>${window.escapeHtml(item.timeLabel || '')}</small>
                </td>
                <td>${window.escapeHtml(item.teacher || 'Chưa cập nhật')}</td>
                <td><span class="dashboard-history-class">${window.escapeHtml(window.formatClassName(item.className, item.facility))}</span></td>
                <td><span class="dashboard-history-student-count">${Number(item.studentCount) || 0}</span></td>
            </tr>`).join('')
        : '<tr class="dashboard-history-empty"><td colspan="4">Chưa có hoạt động nhận xét.</td></tr>';

    const total = document.getElementById('dashboard-history-total');
    const loadMore = document.getElementById('dashboard-history-load-more');
    const endMessage = document.getElementById('dashboard-history-end');
    const canShowMore = visibleCount < items.length || window.dashboardHistoryHasMore;
    if (total) total.textContent = '7 ngày gần nhất';
    if (loadMore) {
        loadMore.hidden = !canShowMore;
        loadMore.disabled = window.dashboardHistoryLoading;
    }
    if (endMessage) endMessage.hidden = canShowMore || items.length === 0;
};

window.openDashboardHistory = () => {
    const modal = document.getElementById('dashboard-history-modal');
    if (!modal) return;
    window.dashboardHistoryPreviousFocus = document.activeElement;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('dashboard-history-open');
    window.loadDashboardHistory();
    requestAnimationFrame(() => document.getElementById('dashboard-history-close')?.focus());
};

window.closeDashboardHistory = () => {
    const modal = document.getElementById('dashboard-history-modal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('dashboard-history-open');
    const previousFocus = window.dashboardHistoryPreviousFocus;
    if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) previousFocus.focus();
    window.dashboardHistoryPreviousFocus = null;
};

window.loadMoreDashboardHistory = async () => {
    if (window.dashboardHistoryLoading) return;

    const items = window.dashboardHistoryItems || [];
    const targetVisibleCount = window.dashboardHistoryVisibleCount + DASHBOARD_HISTORY_VISIBLE_STEP;
    if (window.dashboardHistoryVisibleCount < items.length) {
        window.dashboardHistoryVisibleCount = targetVisibleCount;
        window.renderDashboardHistory();
        return;
    }
    if (!window.dashboardHistoryHasMore) return;

    const oldestTimestamp = Math.min(...window.dashboardHistoryRecords.map(record => (
        window.getRecordTimestampMs(record) || window.parseDateVn(record.date)
    )).filter(value => value > 0));
    if (!Number.isFinite(oldestTimestamp)) {
        window.dashboardHistoryHasMore = false;
        window.renderDashboardHistory();
        return;
    }

    const loadMore = document.getElementById('dashboard-history-load-more');
    window.dashboardHistoryLoading = true;
    if (loadMore) {
        loadMore.disabled = true;
        loadMore.classList.add('loading');
        const label = loadMore.querySelector('span');
        if (label) label.textContent = 'Đang tải...';
    }

    try {
        const olderRecords = await window.fetchDashboardHistoryRecordsPage(oldestTimestamp, window.dashboardHistoryRange || {});
        const knownIds = new Set(window.dashboardHistoryRecords.map(record => record.id).filter(Boolean));
        olderRecords.forEach(record => {
            if (!record.id || !knownIds.has(record.id)) {
                window.dashboardHistoryRecords.push(record);
                if (record.id) knownIds.add(record.id);
            }
        });
        window.dashboardHistoryHasMore = olderRecords.length >= Number(window.dashboardRecordsPageLimit || 50);
        window.dashboardHistoryItems = window.buildDashboardHistoryItems(window.dashboardHistoryRecords);
        window.dashboardHistoryVisibleCount = targetVisibleCount;
        window.renderDashboardHistory();
    } catch (error) {
        console.error('[dashboard history] load more failed:', error);
        window.showModal?.('Không thể tải thêm lịch sử. Vui lòng thử lại.', 'error');
        window.renderDashboardHistory();
    } finally {
        window.dashboardHistoryLoading = false;
        if (loadMore) {
            loadMore.classList.remove('loading');
            loadMore.disabled = false;
            const label = loadMore.querySelector('span');
            if (label) label.textContent = 'Xem thêm';
        }
        window.renderDashboardHistory();
    }
};

window.markDashboardNewsSeen = () => {
    localStorage.setItem('newsClearedTime', String(Date.now()));
    ['attention', 'crowded', 'late'].forEach(category => {
        window.dashboardNewsGroups[category] = [];
        const counter = document.querySelector(`[data-news-count="${category}"]`);
        if (counter) counter.textContent = '0';
    });
    window.renderDashboardNewsCategory(window.dashboardActiveNewsCategory);
};

window.loadDashboardData = async (options = {}) => {
    try {
        const forceRefresh = options.forceRefresh === true;
        const recordsPromise = Array.isArray(options.recordsOverride)
            ? Promise.resolve(options.recordsOverride)
            : window.fetchDashboardRecords({ forceRefresh });
        const [recordsList, attendanceSummary] = await Promise.all([
            recordsPromise,
            window.fetchDashboardSummary({ forceRefresh })
        ]);

        await window.loadDashboardFacilitiesOverview(recordsList, attendanceSummary);

        // === 1. NHÓM RECORDS THEO BATCH ID (gộp thông báo trễ) ===
        const batchMap = {};
        let classAttendanceMap = {};

        recordsList.forEach(r => {
            const recordTimestamp = window.getRecordTimestampMs(r) || window.parseDateVn(r.date);
            const minuteBucket = Math.floor(recordTimestamp / 60000);
            const bid = r.batchId || `${r.className}|${r.facility}|${r.teacher}|${r.date}|${minuteBucket}`;

            if (!batchMap[bid]) {
                batchMap[bid] = {
                    records: [],
                    teacher: r.teacher,
                    className: r.className,
                    facility: r.facility,
                    date: r.date,
                    latestTimestamp: 0
                };
            }
            batchMap[bid].records.push(r);

            // Giữ nguyên map đếm sĩ số lớp
            let timestampDate = new Date(window.getRecordTimestampMs(r) || window.parseDateVn(r.date));
            batchMap[bid].latestTimestamp = Math.max(batchMap[bid].latestTimestamp, timestampDate.getTime());
            let classKey = `${r.date}_${r.className}_${r.facility}_${r.teacher}`;
            if (!classAttendanceMap[classKey]) {
                classAttendanceMap[classKey] = {
                    count: 0,
                    className: r.className,
                    facility: r.facility,
                    date: r.date,
                    teacher: r.teacher,
                    timestamp: timestampDate.getTime()
                };
            }
            classAttendanceMap[classKey].count++;
        });

        let newsFeed = [];

        // === 2. KIỂM TRA TRỄ THEO TỪNG NHÓM BATCH - CHỈ 1 THẺ / BATCH ===
        Object.values(batchMap).forEach(batch => {
            let isLate = false;
            let maxDiffDays = 0;
            let latestTimestamp = null;

            batch.records.forEach(r => {
                let recordDate = window.parseDateVn(r.date);
                let timestampDate = new Date(window.getRecordTimestampMs(r) || recordDate);

                let dateTaught = new Date(recordDate);
                dateTaught.setHours(0, 0, 0, 0);
                let dateSubmitted = new Date(timestampDate);
                dateSubmitted.setHours(0, 0, 0, 0);

                let diffDays = Math.floor((dateSubmitted - dateTaught) / (1000 * 60 * 60 * 24));
                if (diffDays >= 2) {
                    isLate = true;
                    maxDiffDays = Math.max(maxDiffDays, diffDays);
                }
                if (!latestTimestamp || timestampDate > latestTimestamp) {
                    latestTimestamp = timestampDate;
                }
            });

            if (isLate) {
                const studentNames = batch.records.map(r => r.studentName);
                const displayNames = studentNames.slice(0, 3).join(', ');
                const remainingCount = studentNames.length > 3 ? ` và ${studentNames.length - 3} học sinh khác` : '';
                const singleStudentRecord = batch.records.length === 1 ? batch.records[0] : null;


                newsFeed.push({
                    category: 'late',
                    type: 'warning',
                    icon: 'fas fa-clock',
                    title: `GV ${batch.teacher} - Lớp ${window.formatClassName(batch.className, batch.facility)}`,
                    desc: `Nộp nhận xét trễ (${maxDiffDays} ngày) - Ngày dạy: ${batch.date}`,
                    detail: `Áp dụng cho ${studentNames.length} học sinh: ${displayNames}${remainingCount}`,
                    time: latestTimestamp ? latestTimestamp.getTime() : Date.now(),
                    isLate: true,
                    studentTarget: singleStudentRecord ? {
                        id: singleStudentRecord.studentId || "",
                        name: singleStudentRecord.studentName || "",
                        className: singleStudentRecord.className || "",
                        facility: singleStudentRecord.facility || ""
                    } : null
                });
            }
        });

        // === 3. HỌC SINH YẾU / KÉM (giữ nguyên từng học sinh) ===
        recordsList.forEach(r => {
            let contentText = (r.content || "").toLowerCase();
            let commentText = (r.comment || "").toLowerCase();
            let fullText = contentText + " " + commentText;
            let isWeak = false;
            let weakReason = "";

            if (fullText.includes("yếu") || fullText.includes("kém") || fullText.includes("chưa thuộc") || fullText.includes("không thuộc")) {
                isWeak = true;
                weakReason = "Nhận xét có từ khóa yếu/kém/chưa thuộc bài.";
            } else {
                const fractionRegex = /(\d+)\s*\/\s*(\d+)/g;
                let match;
                while ((match = fractionRegex.exec(fullText)) !== null) {
                    let num = parseFloat(match[1]);
                    let den = parseFloat(match[2]);
                    if (den > 0 && (num / den) <= 0.4) {
                        isWeak = true;
                        weakReason = `Tỷ lệ điểm thấp (${match[0]}).`;
                        break;
                    }
                }
            }

            if (isWeak) {
                let timestampDate = new Date(window.getRecordTimestampMs(r) || window.parseDateVn(r.date));

                newsFeed.push({
                    category: 'attention',
                    type: 'danger',
                    icon: 'fas fa-exclamation-triangle',
                    title: `Học sinh cần chú ý: ${r.studentName}`,
                    desc: `Lớp ${window.formatClassName(r.className, r.facility)} - GV ${r.teacher || "Chưa cập nhật"} (${r.date}) - ${weakReason}`,
                    time: timestampDate.getTime(),
                    studentTarget: {
                        id: r.studentId || "",
                        name: r.studentName || "",
                        className: r.className || "",
                        facility: r.facility || ""
                    }
                });
            }
        });

        // === 4. LỚP QUÁ ĐÔNG (giữ nguyên) ===
        Object.values(classAttendanceMap).forEach(info => {
            if (info.count > 15) {
                newsFeed.push({
                    category: 'crowded',
                    type: 'info',
                    icon: 'fas fa-users',
                    title: `Lớp học quá đông (${info.count} HS)`,
                    desc: `Lớp ${window.formatClassName(info.className, info.facility)} ngày ${info.date} do GV ${info.teacher} có ${info.count} học sinh.`,
                    time: info.timestamp
                });
            }
        });

        const filteredHistoryIsActive = window.dashboardHistoryFilterApplied === true;
        let historyItems = window.buildDashboardHistoryItems(recordsList);
        if (!filteredHistoryIsActive) {
            const previousHistoryRecords = window.dashboardHistoryRecords || [];
            const incomingIds = new Set(recordsList.map(record => record.id).filter(Boolean));
            const preserveLoadedHistory = previousHistoryRecords.length > recordsList.length;
            const olderRecords = preserveLoadedHistory
                ? previousHistoryRecords.filter(record => !record.id || !incomingIds.has(record.id))
                : [];
            window.dashboardHistoryRecords = [...recordsList, ...olderRecords];
            if (!preserveLoadedHistory) {
                window.dashboardHistoryHasMore = recordsList.length >= Number(window.dashboardRecordsPageLimit || 50);
            }
            historyItems = window.buildDashboardHistoryItems(window.dashboardHistoryRecords);
        }

        historyItems.forEach(activity => {
            newsFeed.push({
                category: 'recent',
                type: 'success',
                icon: 'fas fa-check',
                title: `GV ${activity.teacher || 'Chưa cập nhật'} vừa nhập nhận xét`,
                desc: `Lớp ${window.formatClassName(activity.className, activity.facility)} · ${activity.studentCount} học sinh · ${activity.timeLabel}`,
                time: activity.timestamp
            });
        });

        newsFeed.sort((a, b) => b.time - a.time);

        const clearedTime = parseInt(localStorage.getItem('newsClearedTime') || '0', 10);
        const newsGroups = { attention: [], crowded: [], late: [], recent: [] };
        newsFeed.forEach(news => {
            if (!newsGroups[news.category]) return;
            const isAlert = news.category !== 'recent';
            if (!isAlert || !clearedTime || news.time > clearedTime) {
                newsGroups[news.category].push(news);
            }
        });

        window.dashboardNewsGroups = newsGroups;
        if (!filteredHistoryIsActive) {
            window.dashboardHistoryItems = historyItems;
            window.dashboardHistoryVisibleCount = options.keepPage
                ? window.dashboardHistoryVisibleCount
                : DASHBOARD_HISTORY_VISIBLE_STEP;
        }

        DASHBOARD_NEWS_CATEGORIES.forEach(category => {
            const counter = document.querySelector(`[data-news-count="${category}"]`);
            if (counter) counter.textContent = String(newsGroups[category].length);
        });

        window.renderDashboardNewsCategory(window.dashboardActiveNewsCategory);
        if (!filteredHistoryIsActive) window.renderDashboardHistory();
    } catch (e) {
        console.error("Dashboard Load Error:", e);
        const container = document.getElementById("dashboard-facilities");
        if (container) container.innerHTML = `<div class="col-12 text-center text-danger p-4">Lỗi tải dữ liệu cơ sở: ${e.message}</div>`;
    }
};

window.handleDashboardRecordsRealtimeUpdate = records => {
    const dashboard = document.getElementById('dashboard');
    if (!dashboard?.classList.contains('active') || window.currentRole !== 'admin') return;
    window.loadDashboardData({ recordsOverride: records, keepPage: true }).catch(error => {
        console.error('[dashboard realtime] render failed:', error);
    });
};

window.openStudentEvaluationFromNews = (newsIndex) => {
    const news = window.dashboardNewsItems?.[Number(newsIndex)];
    const student = news?.studentTarget;
    if (!student?.name || !student?.className) return;

    window.switchTab('quan-ly');
    window.viewStudentFromFilter(
        student.name,
        student.className,
        student.id || "",
        student.facility || "",
        window.classCategoryMap?.[student.className] || ""
    );
};

window.refreshNewsFeed = async () => {
    const newsContainer = document.getElementById('news-feed-container');
    if (newsContainer) {
        newsContainer.innerHTML = '<div class="text-center text-muted p-4">Đang làm mới...</div>';
    }
    await window.loadDashboardData({ forceRefresh: true });
};

window.toggleMobileWidget = (id) => {
    if (window.innerWidth <= 768) {
        const el = document.getElementById(id);
        if (el) {
            el.style.position = 'fixed';
            el.style.top = '0';
            el.style.left = '0';
            el.style.width = '100%';
            el.style.height = '100%';
            el.style.zIndex = '9999';
            el.style.backgroundColor = 'rgba(0,0,0,0.8)';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.padding = '20px';

            const box = el.querySelector('.smooth-box');
            if (box) {
                box.style.width = '100%';
                box.style.maxHeight = '90vh';
                box.style.overflowY = 'auto';
            }

            const closeBtn = el.querySelector('.btn-light.d-md-none');
            if (closeBtn) closeBtn.style.display = 'block';
        }
    }
};

window.closeMobileWidget = (id) => {
    if (window.innerWidth <= 768) {
        const el = document.getElementById(id);
        if (el) {
            el.style.position = '';
            el.style.top = '';
            el.style.left = '';
            el.style.width = '';
            el.style.height = '';
            el.style.zIndex = '';
            el.style.backgroundColor = '';
            el.style.display = '';
            el.style.padding = '';

            const box = el.querySelector('.smooth-box');
            if (box) {
                box.style.width = '';
                box.style.maxHeight = '';
                box.style.overflowY = '';
            }
        }
    }
};

/* ==========================================
   7. XEM ĐÁNH GIÁ & TÌM KIẾM
========================================== */
