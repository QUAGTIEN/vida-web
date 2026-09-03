window.getTimeAgo = function (date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'vừa xong';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
    return date.toLocaleDateString('vi-VN');
};

window.getWorkingDaysAbsence = function (lastDateStr) { return 0; };
window.checkWeakStudent = function (nhanXet) { return false; };

// A touch must finish as a deliberate tap before a review action is allowed.
// Vertical scrolling, dragging and long-pressing cancel the following synthetic click.
const reviewTouchPresses = new Map();
const REVIEW_TAP_MOVE_TOLERANCE = 11;
const REVIEW_TAP_MAX_DURATION = 650;

const getReviewActionButton = (target) => {
    if (window.innerWidth > 768 || typeof target?.closest !== 'function') return null;
    return target.closest('#nhap-lieu button, #nhap-lieu .btn');
};

const cancelReviewButtonClick = (button) => {
    if (!button) return;
    button.classList.remove('review-button-pressed');
    button.dataset.cancelReviewClick = '1';
    window.setTimeout(() => {
        if (button.dataset.cancelReviewClick === '1') delete button.dataset.cancelReviewClick;
    }, 800);
};

document.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    const button = getReviewActionButton(event.target);
    if (!button || button.disabled) return;
    reviewTouchPresses.set(event.pointerId, {
        button,
        x: event.clientX,
        y: event.clientY,
        startedAt: performance.now(),
        moved: false
    });
    button.classList.add('review-button-pressed');
}, { capture: true, passive: true });

document.addEventListener('pointermove', (event) => {
    const press = reviewTouchPresses.get(event.pointerId);
    if (!press || press.moved) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > REVIEW_TAP_MOVE_TOLERANCE) {
        press.moved = true;
        cancelReviewButtonClick(press.button);
    }
}, { capture: true, passive: true });

document.addEventListener('pointercancel', (event) => {
    const press = reviewTouchPresses.get(event.pointerId);
    if (!press) return;
    cancelReviewButtonClick(press.button);
    reviewTouchPresses.delete(event.pointerId);
}, { capture: true, passive: true });

document.addEventListener('pointerup', (event) => {
    const press = reviewTouchPresses.get(event.pointerId);
    if (!press) return;
    const heldTooLong = performance.now() - press.startedAt > REVIEW_TAP_MAX_DURATION;
    const releasedOutside = !press.button.contains(document.elementFromPoint(event.clientX, event.clientY));
    if (press.moved || heldTooLong || releasedOutside || Date.now() < (window.suppressReviewActionsUntil || 0)) {
        cancelReviewButtonClick(press.button);
    } else {
        press.button.classList.remove('review-button-pressed');
    }
    reviewTouchPresses.delete(event.pointerId);
}, { capture: true, passive: true });

document.addEventListener('click', (event) => {
    const button = getReviewActionButton(event.target);
    if (!button) return;
    if (button.dataset.cancelReviewClick === '1' || Date.now() < (window.suppressReviewActionsUntil || 0)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        delete button.dataset.cancelReviewClick;
    }
}, true);

window.parseDateVn = function (dateStr) {
    if (!dateStr) return 0;
    const parts = dateStr.split('/');
    const d = parseInt(parts[0], 10) || 1;
    const m = parseInt(parts[1], 10) || 1;
    const y = parseInt(parts[2], 10) || new Date().getFullYear();
    return new Date(y, m - 1, d).getTime();
};

document.addEventListener("click", e => {
    try {
        const target = e?.target;
        const safeClosest = (selector) => typeof target?.closest === 'function' ? target.closest(selector) : null;

        if (!safeClosest('.search-input-wrapper') && !safeClosest('.search-container') && !safeClosest('.position-relative')) {
            const p = document.getElementById('studentPickerList'); if (p) p.style.display = 'none';
            document.body.classList.remove('student-picker-open');
            const a = document.getElementById('dropdownListA2Global'); if (a) a.style.display = 'none';
            const t = document.getElementById('teacherPickerList'); if (t) t.style.display = 'none';
        }

    } catch (error) {
        console.error('[global click] UI error:', error);
    }
});

// NÚT QUAY LẠI SIDE PANEL - Điều hướng được xử lý riêng trong từng hàm view với addEventListener

document.addEventListener('click', (event) => {
    const managementBack = event.target.closest('#admin-management-back');
    if (!managementBack) return;
    const backEvent = new CustomEvent('spt:admin-management-back', { cancelable: true });
    if (document.dispatchEvent(backEvent)) window.backToDashboardMain?.();
});

// NÚT "ĐÃ XEM" BẢNG TIN - LƯU TRẠNG THÁI VĨNH VIỄN VÀO localStorage
document.addEventListener('click', (e) => {
    try {
        if (e.target.closest('#btn-clear-news')) {
            window.markDashboardNewsSeen?.();
            return;
        }

        const facilityTrigger = e.target.closest('#dashboard-facility-trigger');
        if (facilityTrigger) {
            const menu = document.getElementById('dashboard-facility-menu');
            if (!menu) return;
            const willOpen = menu.hidden;
            menu.hidden = !willOpen;
            facilityTrigger.classList.toggle('open', willOpen);
            facilityTrigger.setAttribute('aria-expanded', String(willOpen));
            return;
        }

        const facilityOption = e.target.closest('.dashboard-facility-option[data-facility-index]');
        if (facilityOption) {
            const facility = window.allFacilities?.[Number(facilityOption.dataset.facilityIndex)];
            if (facility) window.openSystemListPage?.({ tab: 'categories', facility });
            const menu = document.getElementById('dashboard-facility-menu');
            const trigger = document.getElementById('dashboard-facility-trigger');
            if (menu) menu.hidden = true;
            if (trigger) {
                trigger.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
            }
            return;
        }

        const newsTab = e.target.closest('.dashboard-news-tab[data-news-category]');
        if (newsTab) {
            window.renderDashboardNewsCategory?.(newsTab.dataset.newsCategory);
            return;
        }

        if (e.target.closest('#dashboard-history-open')) {
            window.openDashboardHistory?.();
            return;
        }

        if (e.target.closest('#dashboard-history-close')) {
            window.closeDashboardHistory?.();
            return;
        }

        const historyModal = e.target.closest('#dashboard-history-modal');
        if (historyModal && e.target === historyModal) {
            window.closeDashboardHistory?.();
            return;
        }

        if (e.target.closest('#dashboard-history-load-more')) {
            window.loadMoreDashboardHistory?.();
            return;
        }

        if (!e.target.closest('.dashboard-facility-picker')) {
            const menu = document.getElementById('dashboard-facility-menu');
            const trigger = document.getElementById('dashboard-facility-trigger');
            if (menu && !menu.hidden) menu.hidden = true;
            if (trigger) {
                trigger.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
            }
        }

        const newsItem = e.target.closest('.news-item-actionable[data-news-index]');
        if (!newsItem || newsItem.dataset.suppressClick === '1') return;
        window.openStudentEvaluationFromNews(newsItem.dataset.newsIndex);
    } catch (error) {
        console.error('[news click] UI error:', error);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const menu = document.getElementById('dashboard-facility-menu');
        const trigger = document.getElementById('dashboard-facility-trigger');
        if (menu && !menu.hidden) menu.hidden = true;
        if (trigger) {
            trigger.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        }
        window.closeDashboardHistory?.();
    }
    const newsItem = e.target.closest?.('.news-item-actionable[data-news-index]');
    if (!newsItem || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    window.openStudentEvaluationFromNews(newsItem.dataset.newsIndex);
});

// SWIPE TO DISMISS - BẢNG TIN
window.initNewsSwipe = () => {
    const items = document.querySelectorAll('.news-feed-scroll .news-item');
    const THRESHOLD = 100;

    items.forEach(item => {
        if (item.dataset.swipeInit) return; // tránh gắn 2 lần
        item.dataset.swipeInit = '1';

        let startX = 0, currentX = 0, isDragging = false;

        const onStart = (x) => {
            startX = x;
            isDragging = true;
            delete item.dataset.suppressClick;
            item.style.transition = 'none';
        };
        const onMove = (x) => {
            if (!isDragging) return;
            currentX = x - startX;
            if (Math.abs(currentX) > 8) item.dataset.suppressClick = '1';
            const ratio = Math.min(Math.abs(currentX) / THRESHOLD, 1);
            item.style.transform = `translateX(${currentX}px)`;
            item.style.opacity = 1 - ratio * 0.7;
        };
        const onEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            item.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

            if (Math.abs(currentX) >= THRESHOLD) {
                // Vuốt đủ ngưỡng → bay ra ngoài và xóa
                item.style.transform = `translateX(${currentX > 0 ? '120%' : '-120%'})`;
                item.style.opacity = '0';
                item.addEventListener('transitionend', () => {
                    item.remove();
                    // Kiểm tra còn item không
                    const feed = document.querySelector('.news-feed-scroll');
                    if (feed && !feed.querySelector('.news-item')) {
                        feed.innerHTML = '<div class="news-empty-state">Không có thông báo mới.</div>';
                    }
                }, { once: true });
            } else {
                // Chưa đủ ngưỡng → bật về
                item.style.transform = 'translateX(0)';
                item.style.opacity = '1';
            }
            currentX = 0;
            if (item.dataset.suppressClick === '1') {
                setTimeout(() => delete item.dataset.suppressClick, 350);
            }
        };

        // Touch events (Mobile)
        item.addEventListener('touchstart', e => onStart(e.touches[0].clientX), { passive: true });
        item.addEventListener('touchmove', e => onMove(e.touches[0].clientX), { passive: true });
        item.addEventListener('touchend', () => onEnd());

        // Mouse events (Desktop preview)
        item.addEventListener('mousedown', e => onStart(e.clientX));
        item.addEventListener('mousemove', e => { if (isDragging) onMove(e.clientX); });
        item.addEventListener('mouseup', () => onEnd());
        item.addEventListener('mouseleave', () => { if (isDragging) onEnd(); });
    });
};

/** Mobile: ẩn bottom nav khi bàn phím mở (focus + visualViewport) */
window.initMobileBottomNavKeyboardFix = () => {
    const isTextField = (el) => {
        if (!el || !el.tagName) return false;
        const tag = el.tagName;
        if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (tag !== 'INPUT') return false;
        const type = (el.type || '').toLowerCase();
        if (['button', 'submit', 'checkbox', 'radio', 'hidden', 'file', 'reset', 'image'].includes(type)) return false;
        return true;
    };

    const syncFocus = () => {
        const t = document.activeElement;
        document.body.classList.toggle('mobile-input-active', isTextField(t));
    };

    document.addEventListener('focusin', syncFocus);
    document.addEventListener('focusout', () => setTimeout(syncFocus, 180));

    const vv = window.visualViewport;
    if (vv) {
        const syncVv = () => {
            const ih = window.innerHeight;
            const vh = vv.height;
            const offsetTop = vv.offsetTop || 0;
            const keyboardLikely = ih - vh - offsetTop > 72;
            document.body.classList.toggle('mobile-vk-open', keyboardLikely);
        };
        vv.addEventListener('resize', syncVv);
        vv.addEventListener('scroll', syncVv);
    }
};

// KHỞI ĐỘNG HỆ THỐNG
