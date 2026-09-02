import { db } from "../config/firebase.js?v=20260826-data-center-2";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
window.getSystemClassesForFacility = (facilityName = "") => {
    const facility = String(facilityName || "").trim();
    if (!facility) return [];

    const classNames = new Set();
    Object.entries(window.classesByFacilityCategory || {}).forEach(([key, values]) => {
        try {
            const keyParts = JSON.parse(key);
            if (keyParts?.[0] !== facility || !Array.isArray(values)) return;
            values.forEach(className => {
                if (className) classNames.add(className);
            });
        } catch (error) {
            console.warn("Bo qua khoa lop khong hop le trong bo nho dem:", key, error);
        }
    });

    [window.allStudentsGlobalList, window.currentSystemStudents].forEach(students => {
        if (!Array.isArray(students)) return;
        students.forEach(student => {
            if (student?.facility === facility && student.className) classNames.add(student.className);
        });
    });

    return [...classNames].sort((a, b) => a.localeCompare(b, "vi"));
};

window.updateSystemListAddStudentButton = () => {
    const button = document.getElementById("systemListAddStudentBtn");
    const facilityName = document.getElementById("systemListFacSelect")?.value || "";
    const className = document.getElementById("sys-filter-class")?.value || "";
    if (!button) return;

    const canAdd = window.currentRole === "admin" && !!facilityName && !!className;
    button.disabled = !canAdd;
    button.classList.toggle("is-visible", canAdd);
    button.title = canAdd
        ? `Thêm học sinh vào lớp ${className}`
        : "Chọn một lớp để thêm học sinh";
    button.setAttribute("aria-label", button.title);
};

window.handleSystemListClassChange = () => {
    window.updateSystemListAddStudentButton();
    window.filterSystemList();
};

window.promptAddStudentsFromSystemList = () => {
    const facilityName = document.getElementById("systemListFacSelect")?.value || "";
    const className = document.getElementById("sys-filter-class")?.value || "";
    if (!facilityName || !className) {
        return window.showModal("Vui lòng chọn cơ sở và một lớp cụ thể trước khi thêm học sinh.", "error");
    }

    const safeClass = window.escapeHtml(className);
    const safeFacility = window.escapeHtml(facilityName);
    window.showModal(`
        <div class="system-add-student-prompt">
            <span class="system-add-student-prompt-icon"><i class="fas fa-user-plus"></i></span>
            <span><strong>Thêm học sinh vào ${safeClass}</strong><small>${safeFacility} • Mỗi dòng là một học sinh</small></span>
        </div>
    `, "prompt-multiline", async (rawNames) => {
        const requestedNames = String(rawNames || "")
            .split(/\r?\n/)
            .map(name => name.trim())
            .filter(Boolean);
        const uniqueNames = [];
        const requestedKeys = new Set();
        requestedNames.forEach(name => {
            const normalizedName = window.normalizeSearchText(name);
            if (!normalizedName || requestedKeys.has(normalizedName)) return;
            requestedKeys.add(normalizedName);
            uniqueNames.push(name);
        });

        if (uniqueNames.length === 0) {
            return window.showModal("Vui lòng nhập ít nhất một tên học sinh.", "error");
        }

        const existingNames = new Set((window.currentSystemStudents || [])
            .filter(student => student.facility === facilityName && student.className === className)
            .map(student => window.normalizeSearchText(student.studentName || student.name || "")));
        const namesToAdd = uniqueNames.filter(name => !existingNames.has(window.normalizeSearchText(name)));
        const skippedCount = uniqueNames.length - namesToAdd.length;

        if (namesToAdd.length === 0) {
            return window.showModal("Các học sinh này đã có trong lớp. Không có dữ liệu mới để thêm.", "info");
        }

        const button = document.getElementById("systemListAddStudentBtn");
        if (button) {
            button.disabled = true;
            button.classList.add("is-loading");
        }
        try {
            const addedCount = await window.addStudentsToClassDirect(facilityName, className, namesToAdd);
            if (!addedCount) return;
            await window.loadSystemListFacility({ selectedClass: className });
            if (skippedCount > 0) {
                window.showToast(`Đã bỏ qua ${skippedCount} tên trùng trong lớp.`, "info");
            }
        } finally {
            button?.classList.remove("is-loading");
            window.updateSystemListAddStudentButton();
        }
    }, "", { placeholder: "Nguyễn Văn A\nTrần Thị B" });
};

window.openSystemListPage = async () => {
    window.openAdminSection?.('sec-system-list');
    window.showGlobalLoading('Đang tải danh sách hệ thống...');

    document.getElementById('systemListFacSelect').value = "";
    document.getElementById('sys-filter-name').value = "";
    document.getElementById('sys-filter-class').value = "";
    document.getElementById('sys-filter-school').value = "";
    document.getElementById('systemListTableBody').innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Vui lòng chọn cơ sở ở trên</td></tr>';
    document.getElementById('systemListCount').innerText = "Tổng: 0 HS";
    const cardsEl = document.getElementById('systemListCards');
    if (cardsEl) cardsEl.innerHTML = '';
    window.currentSystemStudents = [];
    window.updateSystemListAddStudentButton();

    try {
        if (window.allFacilities.length === 0) await init();
        await window.loadAllStudentsForGlobalSearch();
    } catch (error) {
        console.error('Lỗi khi tải dữ liệu hệ thống:', error);
    } finally {
        window.hideGlobalLoading();
        document.getElementById('sec-system-list').style.display = 'block';
    }
};

window.openSystemListModal = window.openSystemListPage;

window.loadSystemListFacility = async (options = {}) => {
    const fac = document.getElementById('systemListFacSelect').value;
    const tbody = document.getElementById('systemListTableBody');
    const cardsEl = document.getElementById('systemListCards');
    const countEl = document.getElementById('systemListCount');
    const nameInput = document.getElementById('sys-filter-name');
    const classSelect = document.getElementById('sys-filter-class');
    const schoolSelect = document.getElementById('sys-filter-school');
    const resetFilters = options.resetFilters === true;
    const selectedClass = resetFilters ? "" : (options.selectedClass || classSelect?.value || "");
    const selectedSchool = resetFilters ? "" : (schoolSelect?.value || "");

    if (resetFilters && nameInput) nameInput.value = "";

    if (!fac || fac === '-- Chọn Cơ sở --' || fac === '') {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 fw-semibold text-muted">Vui lòng chọn Cơ sở để xem danh sách học sinh.</td></tr>';
        countEl.innerText = "Tổng: 0 HS";
        if (cardsEl) cardsEl.innerHTML = '<div class="system-empty-card">Vui lòng chọn cơ sở để xem danh sách học sinh.</div>';
        window.currentSystemStudents = [];
        window.setSelectOptions(classSelect, 'Tất cả Lớp', []);
        window.setSelectOptions(schoolSelect, 'Tất cả Trường', []);
        window.updateSystemListAddStudentButton();
        return;
    }

    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><i class="fas fa-spinner fa-spin text-primary fa-2x"></i><p class="mt-3 text-muted">Đang tải dữ liệu, vui lòng chờ...</p></td></tr>';

    try {
        const snap = await getDocs(query(collection(db, "students"), where("facility", "==", fac)));
        let students = [];
        snap.forEach(d => students.push({ id: d.id, ...d.data() }));

        students.sort((a, b) => {
            if (a.className === b.className) return a.studentName.localeCompare(b.studentName, 'vi');
            return a.className.localeCompare(b.className, 'vi');
        });

        window.currentSystemStudents = students;

        const classSet = new Set(window.getSystemClassesForFacility(fac));
        const schoolSet = new Set();

        students.forEach(s => {
            if (s.className) classSet.add(s.className);
            if (s.school) schoolSet.add(s.school);
        });

        if (selectedClass) classSet.add(selectedClass);
        window.setSelectOptions(classSelect, 'Tất cả Lớp', [...classSet].sort((a, b) => a.localeCompare(b, 'vi')), selectedClass);
        window.setSelectOptions(schoolSelect, 'Tất cả Trường', [...schoolSet].sort((a, b) => a.localeCompare(b, 'vi')), selectedSchool);

        window.filterSystemList();
        window.updateSystemListAddStudentButton();

    } catch (error) {
        console.error('Lỗi tải danh sách hệ thống:', error);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger"><i class="fas fa-exclamation-triangle fa-2x mb-2"></i><p class="mt-2">Đã xảy ra lỗi khi tải dữ liệu: ${error.message}</p></td></tr>`;
        countEl.innerText = "Tổng: 0 HS";
        window.updateSystemListAddStudentButton();
    }
};

window.filterSystemList = () => {
    const nameF = document.getElementById('sys-filter-name')?.value.toLowerCase() || "";
    const classF = document.getElementById('sys-filter-class')?.value.toLowerCase() || "";
    const schoolF = document.getElementById('sys-filter-school')?.value.toLowerCase() || "";

    if (!window.currentSystemStudents || !Array.isArray(window.currentSystemStudents)) {
        window.renderSystemListTable([]);
        return;
    }

    const filtered = window.currentSystemStudents.filter(s => {
        const matchName = s.studentName.toLowerCase().includes(nameF);
        const matchClass = !classF || s.className.toLowerCase() === classF;
        const matchSchool = (s.school || "").toLowerCase().includes(schoolF);
        return matchName && matchClass && matchSchool;
    });

    window.renderSystemListTable(filtered);
};

window.renderSystemListTable = (data) => {
    const tbody = document.getElementById('systemListTableBody');
    const cardsEl = document.getElementById('systemListCards');
    const countEl = document.getElementById('systemListCount');

    countEl.innerText = `Tổng: ${data.length} HS`;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">Không tìm thấy học sinh nào!</td></tr>';
        if (cardsEl) cardsEl.innerHTML = '<div class="system-empty-card">Kh\u00f4ng t\u00ecm th\u1ea5y h\u1ecdc sinh n\u00e0o!</div>';
        return;
    }

    let html = '';
    let cardHtml = '';
    data.forEach((s, idx) => {
        const safeName = window.escapeHtml(s.studentName || '');
        const safeSchool = window.escapeHtml(s.school || 'Ch\u01b0a c\u00f3 tr\u01b0\u1eddng');
        const safeClass = window.escapeHtml(window.formatClassName(s.className, s.facility));

        let categoryName = window.classCategoryMap[s.className];
        let catColor = window.categoryColorMap[categoryName] || { bg: '#f0fdf4', text: '#166534' };

        html += `
        <tr class="text-center align-middle admin-system-row">
            <td class="fw-bold align-middle">${idx + 1}</td>
            <td class="fw-bold text-dark align-middle text-start">${s.studentName}</td>
            <td class="align-middle"><span class="system-class-pill" data-system-student-index="${idx}">Lớp ${window.formatClassName(s.className, s.facility)}</span></td>
            <td class="align-middle text-start">${s.school || ''}</td>
            <td class="align-middle">
                <div class="d-flex align-items-center justify-content-center gap-2 admin-system-row-actions">
                    <button type="button" class="btn btn-sm admin-table-action admin-table-action-edit" onclick="window.editStudentSystem(${window.jsArg(s.id)})" title="Sửa thông tin"><i class="fas fa-edit"></i><span>Sửa</span></button>
                    <button type="button" class="btn btn-sm admin-table-action admin-table-action-delete" onclick="window.confirmXoaHocSinh(${window.jsArg(s.id)})" title="Xóa học sinh"><i class="fas fa-trash-alt"></i><span>Xóa</span></button>
                </div>
            </td>
        </tr>`;

        cardHtml += `
        <article class="system-student-card">
            <div class="system-student-card-head">
                <span class="system-student-index">${idx + 1}</span>
                <div class="system-student-main">
                    <h4>${safeName}</h4>
                    <span class="system-class-pill" data-system-student-index="${idx}">L\u1edbp ${safeClass}</span>
                </div>
                <div class="system-student-actions">
                    <button type="button" class="system-student-action system-student-edit" onclick="window.editStudentSystem(${window.jsArg(s.id)})" title="S\u1eeda th\u00f4ng tin" aria-label="S\u1eeda ${safeName}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="system-student-action system-student-delete" onclick="window.confirmXoaHocSinh(${window.jsArg(s.id)})" title="X\u00f3a h\u1ecdc sinh" aria-label="X\u00f3a ${safeName}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
            <div class="system-student-meta">
                <span>${safeSchool}</span>
            </div>
        </article>`;
    });

    tbody.innerHTML = html;
    if (cardsEl) cardsEl.innerHTML = cardHtml;
    document.querySelectorAll('[data-system-student-index]').forEach((badge) => {
        const studentIndex = Number(badge.dataset.systemStudentIndex);
        const student = data[studentIndex];
        const category = window.classCategoryMap[student?.className];
        const color = window.categoryColorMap[category] || { bg: '#f0fdf4', text: '#166534' };
        badge.style.setProperty('--system-pill-bg', color.bg);
        badge.style.setProperty('--system-pill-text', color.text);
    });
    window.applyRolePermissions();
};

window.confirmXoaHocSinh = (studentId) => {
    const modal = document.createElement('div');
    modal.className = 'admin-confirm-overlay';
    modal.id = 'confirmDeleteModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'confirmDeleteStudentTitle');
    modal.innerHTML = `
        <div class="admin-confirm-dialog">
            <div class="text-center">
                <div class="admin-confirm-icon admin-confirm-icon-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3 id="confirmDeleteStudentTitle" class="admin-confirm-title">Xác nhận xóa học sinh</h3>
                <p class="admin-confirm-message">Bạn có chắc chắn muốn xóa vĩnh viễn học sinh này? Toàn bộ phiếu đánh giá cũng sẽ bị xóa sạch và không thể khôi phục.</p>
                <div class="admin-confirm-actions">
                    <button type="button" onclick="document.getElementById('confirmDeleteModal').remove()" class="btn btn-light admin-confirm-cancel">Quay lại</button>
                    <button type="button" onclick="window.thucHienXoaHocSinh(${window.jsArg(studentId)})" class="btn btn-danger admin-confirm-submit">Xóa vĩnh viễn</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.thucHienXoaHocSinh = async (studentId) => {
    try {
        const modal = document.getElementById('confirmDeleteModal');
        if (modal) modal.remove();

        const studentRef = doc(db, "students", studentId);
        const studentSnap = await getDoc(studentRef);
        if (!studentSnap.exists()) throw new Error('Khong tim thay hoc sinh can xoa.');

        const student = studentSnap.data();
        const recordDocs = await window.getLinkedStudentRecordDocs({
            studentId,
            studentName: student.studentName || student.name || "",
            className: student.className || "",
            facility: student.facility || ""
        });
        await window.commitStudentRecordDeletes(recordDocs, studentRef);
        window.invalidateA2RecordsCache?.();
        window.invalidateDashboardRecordsCache?.();
        await window.markDashboardSummaryForReconcile?.();
        window.invalidateStudentCaches?.();

        window.showToast('Đã xóa học sinh và các dữ liệu liên quan thành công!', 'success');

        const fac = document.getElementById('systemListFacSelect').value;
        if (fac) {
            await window.loadSystemListFacility();
        }
    } catch (error) {
        console.error('Lỗi khi xóa học sinh:', error);
        window.showToast(error.message || 'Lỗi khi xóa học sinh', 'error');
    }
};

window.editStudentSystem = async (id) => {
    try {
        const docRef = doc(db, "students", id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return window.showModal("Không tìm thấy thông tin học sinh!", "error");

        const student = docSnap.data();

        document.getElementById('editSystemStudentId').value = id;
        document.getElementById('editSystemStudentName').value = student.studentName;
        document.getElementById('editSystemStudentSchool').value = student.school || '';

        document.getElementById('editSystemStudentModal').style.display = 'flex';
    } catch (e) {
        window.showModal("Lỗi tải dữ liệu: " + e.message, "error");
    }
};

window.addEditScheduleRow = (scheduleStr = "") => {
    const container = document.getElementById('editSystemStudentSchedules');
    let day = "Thứ 2", start = "", end = "";

    if (scheduleStr) {
        const parts = scheduleStr.split(':');
        if (parts.length >= 2) {
            day = parts[0].trim();
            let timeStr = parts.slice(1).join(':').trim();
            const timeParts = timeStr.split('-');

            if (timeParts.length >= 2) {
                start = timeParts[0].trim();
                end = timeParts[1].trim();
            } else {
                start = timeParts[0].trim();
            }
        } else {
            day = scheduleStr;
        }
    }

    const daysList = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"];
    const daysOptions = daysList.map(d => {
        const dClass = window.getDayClass(d);
        return `<option value="${d}" class="${dClass}" ${d === day ? 'selected' : ''}>${d}</option>`;
    }).join('');

    const row = document.createElement('div');
    row.className = "schedule-row edit-schedule-row mb-2";
    row.innerHTML = `
        <select class="form-select fw-bold sched-day edit-schedule-day" onchange="window.updateSelectColor(this)">${daysOptions}</select>
        <input type="text" class="form-control sched-start text-center edit-schedule-time" value="${start}" placeholder="18:30" required>
        <span class="fw-bold edit-schedule-separator">-</span>
        <input type="text" class="form-control sched-end text-center edit-schedule-time" value="${end}" placeholder="21:00" required>
        <button type="button" class="btn btn-danger btn-sm edit-schedule-remove" onclick="window.removeEditScheduleRow(this)" aria-label="Xóa lịch học"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(row);

    setTimeout(() => {
        const selects = container.querySelectorAll('.sched-day');
        if (selects.length > 0) window.updateSelectColor(selects[selects.length - 1]);
    }, 10);
};

window.removeEditScheduleRow = (btn) => {
    btn.closest('.schedule-row').remove();
};

window.saveSystemStudentEdit = async () => {
    const id = document.getElementById('editSystemStudentId').value;
    const name = document.getElementById('editSystemStudentName').value.trim();
    const school = document.getElementById('editSystemStudentSchool').value.trim();

    if (!name) return window.showModal("Vui lòng nhập tên học sinh!", "error");

    try {
        const studentRef = doc(db, "students", id);
        const studentSnap = await getDoc(studentRef);
        if (!studentSnap.exists()) throw new Error('Khong tim thay hoc sinh can cap nhat.');

        const currentStudent = studentSnap.data();
        const oldName = currentStudent.studentName || currentStudent.name || "";
        const studentUpdate = {
            studentName: name,
            school: school,
            ...window.getStudentSearchDocumentFields(name)
        };

        if (oldName !== name) {
            const recordDocs = await window.getLinkedStudentRecordDocs({
                studentId: id,
                studentName: oldName,
                className: currentStudent.className || "",
                facility: currentStudent.facility || ""
            });

            if (recordDocs.length <= 449) {
                const batch = writeBatch(db);
                batch.update(studentRef, studentUpdate);
                recordDocs.forEach(recordDoc => batch.update(recordDoc.ref, {
                    studentId: id,
                    studentName: name,
                    updatedAt: serverTimestamp()
                }));
                await batch.commit();
            } else {
                await window.commitDocUpdatesInChunks(recordDocs, () => ({
                    studentId: id,
                    studentName: name,
                    updatedAt: serverTimestamp()
                }));
                await updateDoc(studentRef, studentUpdate);
            }
        } else {
            await updateDoc(studentRef, studentUpdate);
        }

        document.getElementById('editSystemStudentModal').style.display = 'none';
        window.showModal("Cập nhật thành công!", "success");

        window.invalidateA2RecordsCache?.();
        window.invalidateDashboardRecordsCache?.();
        window.invalidateStudentCaches?.();
        window.loadSystemListFacility();

        const lopGV = document.getElementById("select-lop-gv")?.value;
        if (lopGV) window.loadSchedulesForClass();

    } catch (e) {
        window.showModal("Lỗi: " + e.message, "error");
    }
};

/* ==========================================
   9. TÍNH NĂNG XUẤT FULL EXCEL TOÀN HỆ THỐNG
========================================== */
