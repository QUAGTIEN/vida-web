import { auth, db } from "../config/firebase.js?v=20260826-data-center-2";
import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    increment,
    query,
    serverTimestamp,
    setDoc,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const refreshUnifiedSystemView = async (context, fallback) => {
    if (typeof window.refreshSystemHub === "function") {
        window.closePanel?.();
        await window.refreshSystemHub(context);
        return;
    }
    fallback?.();
};
window.promptDeleteFacility = (facName) => {
    window.showModal(`Bạn có chắc chắn muốn xóa cơ sở <b class="text-danger">${facName}</b> không?`, 'confirm', async () => {
        try {
            const q = query(collection(db, "categories"), where("facility", "==", facName));
            const snap = await getDocs(q);
            if (!snap.empty) {
                return window.showModal("Không thể xóa! Vui lòng xóa sạch các Khối trong Cơ sở này trước.", "error");
            }

            const qFac = query(collection(db, "facilities"), where("name", "==", facName));
            const snapFac = await getDocs(qFac);
            const batch = writeBatch(db);
            snapFac.forEach(d => batch.delete(d.ref));
            await batch.commit();
            window.invalidateStudentCaches?.();

            window.closePanel();
            window.showModal("Đã xóa Cơ sở thành công!", "success");
            await window.refreshSystemStaticData?.();
            await refreshUnifiedSystemView({ tab: "facilities" });
            window.loadDashboardData();
        } catch (error) {
            window.showModal("Lỗi khi xóa: " + error.message, "error");
        }
    });
};

window.promptDeleteCategory = (facName, catName) => {
    window.showModal(`Bạn có chắc chắn muốn xóa khối <b class="text-danger">${catName}</b> không?`, 'confirm', async () => {
        try {
            const q = query(collection(db, "classes"), where("facility", "==", facName), where("category", "==", catName));
            const snap = await getDocs(q);
            if (!snap.empty) {
                window.showToast('Lỗi: Vui lòng xóa toàn bộ Lớp bên trong trước khi xóa Khối này!', 'error');
                return;
            }

            const qCat = query(collection(db, "categories"), where("facility", "==", facName), where("name", "==", catName));
            const snapCat = await getDocs(qCat);
            const batch = writeBatch(db);
            snapCat.forEach(d => batch.delete(d.ref));

            await batch.commit();
            window.invalidateStudentCaches?.();
            window.showToast('Đã xóa Khối thành công!', 'success');

            if (window.facilityCategoriesMap[facName]) {
                window.facilityCategoriesMap[facName] = window.facilityCategoriesMap[facName].filter(item => item !== catName);
            }
            await window.refreshSystemStaticData?.();
            await refreshUnifiedSystemView(
                { tab: "categories", facility: facName },
                () => window.viewFacilityDetails(facName)
            );
            window.loadDashboardData();
        } catch (error) {
            console.error(error);
            window.showToast(error.message || 'Lỗi khi xóa khối', 'error');
        }
    });
};

window.promptDeleteClass = (facName, catName, className) => {
    if (!confirm('Bạn có chắc chắn muốn xóa Lớp này? BẢNG CẢNH BÁO: Toàn bộ học sinh thuộc lớp này cũng sẽ bị xóa vĩnh viễn!')) return;

    (async () => {
        try {
            const batch = writeBatch(db);

            // 1. Xóa toàn bộ học sinh thuộc lớp này
            const q = query(collection(db, "students"), where("facility", "==", facName), where("className", "==", className));
            const snap = await getDocs(q);
            snap.forEach(d => batch.delete(d.ref));

            // 2. Xóa chính lớp
            const qClass = query(collection(db, "classes"), where("facility", "==", facName), where("category", "==", catName), where("name", "==", className));
            const snapClass = await getDocs(qClass);
            snapClass.forEach(d => batch.delete(d.ref));

            await batch.commit();
            window.invalidateStudentCaches?.();
            window.showToast('Đã xóa thành công Lớp và toàn bộ học sinh bên trong!', 'success');
            await refreshUnifiedSystemView(
                { tab: "classes", facility: facName, category: catName },
                () => window.viewCategoryDetails(facName, catName)
            );
            window.loadDashboardData();
        } catch (error) {
            console.error(error);
            window.showToast(error.message || 'Lỗi khi xóa lớp', 'error');
        }
    })();
};

window.promptDeleteStudent = (facName, catName, className, studentName) => {
    window.showModal(`Bạn có chắc chắn muốn xóa học sinh <b class="text-danger">${studentName}</b> khỏi lớp <b>${className}</b> không?`, 'confirm', async () => {
        try {
            const q = query(collection(db, "students"), where("facility", "==", facName), where("className", "==", className), where("studentName", "==", studentName));
            const snap = await getDocs(q);
            const batch = writeBatch(db);
            snap.forEach(d => batch.delete(d.ref));

            await batch.commit();
            window.invalidateStudentCaches?.();
            window.showModal("Đã xóa Học sinh thành công!", "success");
            window.viewClassDetails(facName, catName, className);
            window.loadDashboardData();
        } catch (error) {
            window.showModal("Lỗi khi xóa: " + error.message, "error");
        }
    });
};

window.commitDocUpdatesInChunks = async (docs, dataFactory, chunkSize = 450) => {
    for (let i = 0; i < docs.length; i += chunkSize) {
        const batch = writeBatch(db);
        docs.slice(i, i + chunkSize).forEach((docSnap) => {
            batch.update(docSnap.ref, dataFactory(docSnap));
        });
        await batch.commit();
    }
};

window.getLinkedStudentRecordDocs = async ({ studentId = "", studentName = "", className = "", facility = "" } = {}) => {
    const lookups = [];
    if (studentId) {
        lookups.push(getDocs(query(collection(db, "records"), where("studentId", "==", studentId))));
    }
    if (studentName) {
        const legacyFilters = [where("studentName", "==", studentName)];
        if (className) legacyFilters.push(where("className", "==", className));
        lookups.push(getDocs(query(collection(db, "records"), ...legacyFilters)));
    }

    const snapshots = await Promise.all(lookups);
    const linkedDocs = new Map();
    snapshots.forEach(snapshot => snapshot.docs.forEach(recordDoc => {
        const record = recordDoc.data();
        const matchesStableId = studentId && record.studentId === studentId;
        const matchesLegacyIdentity = !record.studentId
            && record.studentName === studentName
            && (!className || record.className === className)
            && (!facility || !record.facility || window.getFacilityCode(record.facility) === window.getFacilityCode(facility));
        if (matchesStableId || matchesLegacyIdentity) linkedDocs.set(recordDoc.id, recordDoc);
    }));
    return [...linkedDocs.values()];
};

window.commitStudentRecordDeletes = async (recordDocs = [], studentRef) => {
    if (recordDocs.length <= 449) {
        const batch = writeBatch(db);
        recordDocs.forEach(recordDoc => batch.delete(recordDoc.ref));
        batch.delete(studentRef);
        await batch.commit();
        return;
    }

    for (let i = 0; i < recordDocs.length; i += 450) {
        const batch = writeBatch(db);
        recordDocs.slice(i, i + 450).forEach(recordDoc => batch.delete(recordDoc.ref));
        await batch.commit();
    }
    await deleteDoc(studentRef);
};

window.promptCreateCategoryForFacility = (facName) => {
    window.showModal(`Th\u00eam kh\u1ed1i m\u1edbi v\u00e0o <b>${window.escapeHtml(facName)}</b>:<br><span class="small text-muted">Nh\u1eadp t\u00ean kh\u1ed1i c\u1ea7n th\u00eam.</span>`, "prompt", async (rawName) => {
        const name = window.normalizeEntityName(rawName);
        if (!name) return window.showModal("T\u00ean kh\u1ed1i kh\u00f4ng \u0111\u01b0\u1ee3c \u0111\u1ec3 tr\u1ed1ng!", "error");

        const facInput = document.getElementById("select-facility-tao-khoi");
        const nameInput = document.getElementById("new-khoi-input");
        if (facInput) facInput.value = facName;
        if (nameInput) nameInput.value = name;

        await window.createKhoi();
        await refreshUnifiedSystemView(
            { tab: "categories", facility: facName },
            () => window.viewFacilityDetails(facName)
        );
    }, "", { placeholder: "Nh\u1eadp t\u00ean kh\u1ed1i..." });
};

window.promptCreateClassForCategory = (facName, catName) => {
    window.showModal(`Th\u00eam l\u1edbp m\u1edbi v\u00e0o <b>${window.escapeHtml(catName)}</b>:<br><span class="small text-muted">Nh\u1eadp t\u00ean l\u1edbp c\u1ea7n th\u00eam.</span>`, "prompt", async (rawName) => {
        const name = window.normalizeEntityName(rawName);
        if (!name) return window.showModal("T\u00ean l\u1edbp kh\u00f4ng \u0111\u01b0\u1ee3c \u0111\u1ec3 tr\u1ed1ng!", "error");

        const facInput = document.getElementById("select-facility-tao-lop");
        const catInput = document.getElementById("select-khoi-tao-lop");
        const nameInput = document.getElementById("new-class-input");
        if (facInput) facInput.value = facName;
        if (catInput) catInput.value = catName;
        if (nameInput) nameInput.value = name;

        await window.createClass();
        await refreshUnifiedSystemView(
            { tab: "classes", facility: facName, category: catName },
            () => window.viewCategoryDetails(facName, catName)
        );
    }, "", { placeholder: "Nh\u1eadp t\u00ean l\u1edbp..." });
};

window.addStudentsToClassDirect = async (facName, className, names) => {
    if (!auth || !auth.currentUser) {
        window.showToast('L\u1ed7i: B\u1ea1n ch\u01b0a \u0111\u0103ng nh\u1eadp ho\u1eb7c phi\u00ean l\u00e0m vi\u1ec7c \u0111\u00e3 h\u1ebft h\u1ea1n. Vui l\u00f2ng t\u1ea3i l\u1ea1i trang!', 'error');
        return 0;
    }
    if (!facName || !className || !Array.isArray(names) || names.length === 0) {
        window.showModal("Thi\u1ebfu th\u00f4ng tin th\u00eam h\u1ecdc sinh!", "error");
        return 0;
    }

    const uniqueNames = [...new Set(names.map(name => String(name || "").trim()).filter(Boolean))];
    if (uniqueNames.length === 0) {
        window.showModal("Vui l\u00f2ng nh\u1eadp t\u00ean h\u1ecdc sinh!", "error");
        return 0;
    }

    try {
        const batch = writeBatch(db);
        uniqueNames.forEach(name => {
            const studentRef = doc(collection(db, "students"));
            batch.set(studentRef, {
                studentName: name,
                className,
                facility: facName,
                createdAt: serverTimestamp(),
                ...window.getStudentSearchDocumentFields(name)
            });
        });
        await batch.commit();

        const thongKeRef = doc(db, "ThongKe", window.toThongKeDocId(facName));
        await setDoc(thongKeRef, { SoHocSinh: increment(uniqueNames.length) }, { merge: true });
        window.invalidateStudentCaches?.();
        window.showModal(`\u0110\u00e3 th\u00eam ${uniqueNames.length} h\u1ecdc sinh!`, "success");
        window.showToast('Th\u00eam h\u1ecdc sinh th\u00e0nh c\u00f4ng!', 'success');
        window.loadDashboardData?.();
        return uniqueNames.length;
    } catch (error) {
        console.error(error);
        window.showToast(error?.message || 'L\u1ed7i th\u00eam h\u1ecdc sinh.', 'error');
        window.showModal("L\u1ed7i th\u00eam h\u1ecdc sinh: " + (error?.message || "Kh\u00f4ng x\u00e1c \u0111\u1ecbnh"), "error");
        return 0;
    }
};

window.renderSystemPanelItem = ({ label, icon, tone = "green", openAction, renameAction, deleteAction }) => {
    const safeLabel = window.escapeHtml(label);
    return `
        <div class="system-panel-item system-panel-item-${tone}">
            <button type="button" class="system-panel-main" onclick="${openAction}">
                <span class="system-panel-icon"><i class="${icon}"></i></span>
                <span class="system-panel-name">${safeLabel}</span>
            </button>
            <div class="system-panel-actions admin-only-flex">
                <button type="button" class="system-action-btn system-action-rename" onclick="${renameAction}" title="Đổi tên" aria-label="Đổi tên ${safeLabel}">
                    <i class="fas fa-pen"></i>
                </button>
                <button type="button" class="system-action-btn system-action-delete" onclick="${deleteAction}" title="Xóa" aria-label="Xóa ${safeLabel}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
            <button type="button" class="system-panel-next" onclick="${openAction}" title="Xem chi tiết" aria-label="Xem chi tiết ${safeLabel}">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>`;
};

window.promptRenameFacility = (oldName) => {
    window.showModal(`Đổi tên cơ sở <b>${window.escapeHtml(oldName)}</b> thành:`, "prompt", async (rawName) => {
        const newName = window.normalizeEntityName(rawName);
        if (!newName) return window.showModal("Tên cơ sở không được để trống!", "error");
        if (newName === oldName) return;

        try {
            window.showGlobalLoading("Đang đổi tên cơ sở...");
            const duplicate = await getDocs(query(collection(db, "facilities"), where("name", "==", newName)));
            if (!duplicate.empty) return window.showModal("Cơ sở này đã tồn tại!", "error");

            const [facSnap, catSnap, classSnap, studentSnap, recordSnap] = await Promise.all([
                getDocs(query(collection(db, "facilities"), where("name", "==", oldName))),
                getDocs(query(collection(db, "categories"), where("facility", "==", oldName))),
                getDocs(query(collection(db, "classes"), where("facility", "==", oldName))),
                getDocs(query(collection(db, "students"), where("facility", "==", oldName))),
                getDocs(query(collection(db, "records"), where("facility", "==", oldName)))
            ]);

            await window.commitDocUpdatesInChunks(facSnap.docs, () => ({ name: newName }));
            await window.commitDocUpdatesInChunks(catSnap.docs, () => ({ facility: newName }));
            await window.commitDocUpdatesInChunks(classSnap.docs, () => ({ facility: newName }));
            await window.commitDocUpdatesInChunks(studentSnap.docs, () => ({ facility: newName }));
            await window.commitDocUpdatesInChunks(recordSnap.docs, () => ({ facility: newName }));
            window.invalidateStudentCaches?.();

            window.showModal("Đã đổi tên cơ sở thành công!", "success");
            await window.refreshSystemStaticData?.();
            await refreshUnifiedSystemView(
                { tab: "categories", facility: newName },
                () => window.viewFacilityDetails(newName)
            );
            window.loadDashboardData();
        } catch (error) {
            console.error(error);
            window.showModal("Lỗi đổi tên cơ sở: " + (error.message || ""), "error");
        } finally {
            window.hideGlobalLoading();
        }
    }, oldName);
};

window.promptRenameCategory = (facName, oldName) => {
    window.showModal(`Đổi tên khối <b>${window.escapeHtml(oldName)}</b> thành:`, "prompt", async (rawName) => {
        const newName = window.normalizeEntityName(rawName);
        if (!newName) return window.showModal("Tên khối không được để trống!", "error");
        if (newName === oldName) return;

        try {
            window.showGlobalLoading("Đang đổi tên khối...");
            const duplicate = await getDocs(query(collection(db, "categories"), where("facility", "==", facName), where("name", "==", newName)));
            if (!duplicate.empty) return window.showModal("Khối này đã tồn tại trong cơ sở!", "error");

            const [catSnap, classSnap] = await Promise.all([
                getDocs(query(collection(db, "categories"), where("facility", "==", facName), where("name", "==", oldName))),
                getDocs(query(collection(db, "classes"), where("facility", "==", facName), where("category", "==", oldName)))
            ]);

            await window.commitDocUpdatesInChunks(catSnap.docs, () => ({ name: newName }));
            await window.commitDocUpdatesInChunks(classSnap.docs, () => ({ category: newName }));
            window.invalidateStudentCaches?.();

            window.showToast("Đã đổi tên khối thành công!", "success");
            await window.refreshSystemStaticData?.();
            await refreshUnifiedSystemView(
                { tab: "categories", facility: facName },
                () => window.viewFacilityDetails(facName)
            );
            window.loadDashboardData();
        } catch (error) {
            console.error(error);
            window.showModal("Lỗi đổi tên khối: " + (error.message || ""), "error");
        } finally {
            window.hideGlobalLoading();
        }
    }, oldName);
};

window.promptRenameClass = (facName, catName, oldName) => {
    window.showModal(`Đổi tên lớp <b>${window.escapeHtml(oldName)}</b> thành:`, "prompt", async (rawName) => {
        const newName = window.normalizeEntityName(rawName);
        if (!newName) return window.showModal("Tên lớp không được để trống!", "error");
        if (newName === oldName) return;

        try {
            window.showGlobalLoading("Đang đổi tên lớp...");
            const duplicate = await getDocs(query(collection(db, "classes"), where("facility", "==", facName), where("category", "==", catName), where("name", "==", newName)));
            if (!duplicate.empty) return window.showModal("Lớp này đã tồn tại trong khối!", "error");

            const [classSnap, studentSnap, recordSnap] = await Promise.all([
                getDocs(query(collection(db, "classes"), where("facility", "==", facName), where("category", "==", catName), where("name", "==", oldName))),
                getDocs(query(collection(db, "students"), where("facility", "==", facName), where("className", "==", oldName))),
                getDocs(query(collection(db, "records"), where("facility", "==", facName), where("className", "==", oldName)))
            ]);

            await window.commitDocUpdatesInChunks(classSnap.docs, () => ({ name: newName }));
            await window.commitDocUpdatesInChunks(studentSnap.docs, () => ({ className: newName }));
            await window.commitDocUpdatesInChunks(recordSnap.docs, () => ({ className: newName }));
            window.invalidateStudentCaches?.();

            window.showToast("Đã đổi tên lớp thành công!", "success");
            await refreshUnifiedSystemView(
                { tab: "classes", facility: facName, category: catName },
                () => window.viewCategoryDetails(facName, catName)
            );
            window.loadDashboardData();
        } catch (error) {
            console.error(error);
            window.showModal("Lỗi đổi tên lớp: " + (error.message || ""), "error");
        } finally {
            window.hideGlobalLoading();
        }
    }, oldName);
};

window.viewFacilityDetails = async (facName) => {
    const panel = document.getElementById("class-side-panel");
    const title = document.getElementById("panel-main-title");
    const subTitle = document.getElementById("panel-sub-title");
    const content = document.getElementById("panel-content-list");
    const btnBack = document.getElementById("btn-panel-back");
    const pb = document.getElementById("panel-buttons");

    if (!panel || !content) return;

    if (title) title.innerHTML = `<i class="fas fa-building me-2"></i>${facName}`;
    if (subTitle) subTitle.innerHTML = `Danh sách các Khối`;

    const goBack = () => window.closePanel();
    if (btnBack) {
        btnBack.style.display = "block";
        btnBack.removeEventListener('click', btnBack._backHandler);
        btnBack._backHandler = (e) => { e.preventDefault(); e.stopPropagation(); goBack(); };
        btnBack.addEventListener('click', btnBack._backHandler);
    }

    if (pb) {
        pb.innerHTML = window.currentRole === 'admin' ? `<button class="btn btn-sm btn-outline-danger admin-only" onclick="window.promptDeleteFacility('${facName}')" title="Xóa cơ sở này"><i class="fas fa-trash-alt me-1"></i> Xóa Cơ Sở</button>` : "";
    }

    content.innerHTML = "<div class='text-center p-5'><i class='fas fa-spinner fa-spin fa-2x text-primary'></i><p class='mt-3'>Đang tải dữ liệu...</p></div>";

    if (pb && window.currentRole === 'admin') {
        pb.innerHTML = `
            <div class="system-panel-toolbar admin-only-flex">
                <button type="button" class="system-toolbar-btn system-toolbar-add" onclick="window.promptCreateCategoryForFacility(${window.jsArg(facName)})" title="Th\u00eam kh\u1ed1i"><i class="fas fa-plus"></i><span>Th\u00eam kh\u1ed1i</span></button>
                <button type="button" class="system-toolbar-btn system-toolbar-rename" onclick="window.promptRenameFacility(${window.jsArg(facName)})" title="Đổi tên cơ sở"><i class="fas fa-pen"></i><span>Đổi tên</span></button>
                <button type="button" class="system-toolbar-btn system-toolbar-delete" onclick="window.promptDeleteFacility(${window.jsArg(facName)})" title="Xóa cơ sở này"><i class="fas fa-trash-alt"></i><span>Xóa</span></button>
            </div>`;
    }

    const over = document.getElementById("side-panel-overlay");
    if (over) over.classList.add("active");
    panel.classList.add("active");

    try {
        let list = window.facilityCategoriesMap[facName] || [];
        list.sort();
        if (list.length === 0) {
            content.innerHTML = "<div class='text-center p-5 text-muted'>Cơ sở này chưa có Khối nào.</div>";
            return;
        }
        const html = '<div class="system-panel-list">' + list.map(k => window.renderSystemPanelItem({
            label: k,
            icon: "fas fa-layer-group",
            tone: "blue",
            openAction: `window.viewCategoryDetails(${window.jsArg(facName)}, ${window.jsArg(k)})`,
            renameAction: `window.promptRenameCategory(${window.jsArg(facName)}, ${window.jsArg(k)})`,
            deleteAction: `window.promptDeleteCategory(${window.jsArg(facName)}, ${window.jsArg(k)})`
        })).join('') + '</div>';
        content.innerHTML = html;
        window.applyRolePermissions();
    } catch (e) {
        content.innerHTML = `<div class='text-danger p-4 text-center'>Lỗi: ${e.message}</div>`;
    }

    /* Swipe right to go back */
    let touchstartX = 0;
    let touchendX = 0;
    const swipeHandler = (e) => {
        touchendX = e.changedTouches[0].screenX;
        if (touchendX - touchstartX > 80) goBack();
    };
    panel.removeEventListener('touchstart', panel._swipeStart);
    panel.removeEventListener('touchend', panel._swipeEnd);
    panel._swipeStart = (e) => { touchstartX = e.changedTouches[0].screenX; };
    panel._swipeEnd = swipeHandler;
    panel.addEventListener('touchstart', panel._swipeStart, { passive: true });
    panel.addEventListener('touchend', panel._swipeEnd, { passive: true });
};

window.viewCategoryDetails = async (facName, catName) => {
    const content = document.getElementById("panel-content-list");
    const title = document.getElementById("panel-main-title");
    const subTitle = document.getElementById("panel-sub-title");
    const btnBack = document.getElementById("btn-panel-back");
    const pb = document.getElementById("panel-buttons");

    if (title) title.innerHTML = `<i class="fas fa-layer-group me-2"></i>${catName}`;
    if (subTitle) subTitle.innerHTML = `Danh sách các Lớp`;
    if (btnBack) {
        btnBack.style.display = "block";
        btnBack.removeEventListener('click', btnBack._backHandler);
        btnBack._backHandler = (e) => { e.preventDefault(); e.stopPropagation(); window.viewFacilityDetails(facName); };
        btnBack.addEventListener('click', btnBack._backHandler);
    }
    if (pb) {
        pb.innerHTML = window.currentRole === 'admin'
            ? `<div class="system-panel-toolbar admin-only-flex"><button type="button" class="system-toolbar-btn system-toolbar-add" onclick="window.promptCreateClassForCategory(${window.jsArg(facName)}, ${window.jsArg(catName)})" title="Th\u00eam l\u1edbp"><i class="fas fa-plus"></i><span>Th\u00eam l\u1edbp</span></button></div>`
            : "";
    }

    content.innerHTML = "<div class='text-center p-5'><i class='fas fa-spinner fa-spin fa-2x text-primary'></i><p class='mt-3'>Đang tải dữ liệu...</p></div>";

    try {
        const snap = await getDocs(query(collection(db, "classes"), where("category", "==", catName), where("facility", "==", facName)));
        let classes = [];
        snap.forEach(d => classes.push(d.data().name));
        classes.sort();

        if (classes.length === 0) {
            content.innerHTML = "<div class='text-center p-5 text-muted'>Khối này chưa có Lớp nào.</div>";
            return;
        }

        const html = '<div class="system-panel-list">' + classes.map(c => window.renderSystemPanelItem({
            label: c,
            icon: "fas fa-chalkboard",
            tone: "green",
            openAction: `window.viewClassDetails(${window.jsArg(facName)}, ${window.jsArg(catName)}, ${window.jsArg(c)})`,
            renameAction: `window.promptRenameClass(${window.jsArg(facName)}, ${window.jsArg(catName)}, ${window.jsArg(c)})`,
            deleteAction: `window.promptDeleteClass(${window.jsArg(facName)}, ${window.jsArg(catName)}, ${window.jsArg(c)})`
        })).join('') + '</div>';
        content.innerHTML = html;
        window.applyRolePermissions();
    } catch (e) {
        content.innerHTML = `<div class='text-danger p-4 text-center'>Lỗi: ${e.message}</div>`;
    }
};

window.viewClassDetails = async (facName, catName, className) => {
    const content = document.getElementById("panel-content-list");
    const title = document.getElementById("panel-main-title");
    const subTitle = document.getElementById("panel-sub-title");
    const btnBack = document.getElementById("btn-panel-back");
    const pb = document.getElementById("panel-buttons");

    if (title) title.innerHTML = `<i class="fas fa-chalkboard me-2"></i>Lớp ${className}`;
    if (subTitle) subTitle.innerHTML = `Danh sách Học sinh`;
    if (btnBack) {
        btnBack.style.display = "block";
        btnBack.removeEventListener('click', btnBack._backHandler);
        btnBack._backHandler = (e) => { e.preventDefault(); e.stopPropagation(); window.viewCategoryDetails(facName, catName); };
        btnBack.addEventListener('click', btnBack._backHandler);
    }
    if (pb) pb.innerHTML = "";

    content.innerHTML = "<div class='text-center p-5'><i class='fas fa-spinner fa-spin fa-2x text-primary'></i><p class='mt-3'>Đang tải dữ liệu...</p></div>";

    try {
        const snap = await getDocs(query(collection(db, "students"), where("className", "==", className), where("facility", "==", facName)));
        let students = [];
        snap.forEach(d => students.push(d.data().studentName));
        students.sort((a, b) => a.localeCompare(b, 'vi'));

        if (students.length === 0) {
            content.innerHTML = "<div class='text-center p-5 text-muted'>Lớp này chưa có Học sinh nào.</div>";
            return;
        }

        const html = '<div class="system-panel-student-list">' + students.map((s, idx) => `
            <div class="system-panel-student-item">
                <span class="system-panel-student-index">${idx + 1}</span>
                <span class="system-panel-student-name">${window.escapeHtml(s)}</span>
            </div>`).join('') + '</div>';
        content.innerHTML = html;
        window.applyRolePermissions();
    } catch (e) {
        content.innerHTML = `<div class='text-danger p-4 text-center'>Lỗi: ${e.message}</div>`;
    }
};

const TEACHER_STATS_PERIOD_LABELS = {
    all: "toàn bộ thời gian",
    "one-month": "1 tháng gần nhất",
    "three-months": "3 tháng gần nhất",
    "six-months": "6 tháng gần nhất",
    "twelve-months": "12 tháng gần nhất",
    custom: "khoảng ngày đã chọn"
};
const TEACHER_STATS_PERIOD_MONTHS = {
    "one-month": 1,
    "three-months": 3,
    "six-months": 6,
    "twelve-months": 12
};
const TEACHER_STATS_CACHE_MS = 60000;
const teacherStatsCache = new Map();
const teacherStatsState = {
    requestId: 0,
    teacherName: "",
    period: "one-month",
    customStartDate: "",
    customEndDate: "",
    records: [],
    classSummaries: [],
    selectedClassKey: "",
    studentSummaries: []
};

const normalizeTeacherStatsValue = value => String(value || "").trim().toLocaleLowerCase("vi");

const getTeacherStatsElements = () => ({
    directory: document.getElementById("admin-teacher-directory"),
    statsView: document.getElementById("admin-teacher-stats-view"),
    classView: document.getElementById("admin-teacher-class-view"),
    managementTopbar: document.querySelector("#admin-management-panels .admin-management-topbar"),
    toolbarContext: document.getElementById("admin-teacher-toolbar-context"),
    statsTitle: document.getElementById("admin-teacher-stats-title"),
    statsAvatar: document.getElementById("admin-teacher-stats-avatar"),
    toolbarSubtitle: document.getElementById("admin-teacher-toolbar-subtitle"),
    periodSelect: document.getElementById("admin-teacher-period"),
    customPeriod: document.getElementById("admin-teacher-custom-period"),
    periodStart: document.getElementById("admin-teacher-period-start"),
    periodEnd: document.getElementById("admin-teacher-period-end"),
    periodError: document.getElementById("admin-teacher-period-error"),
    rankingNote: document.getElementById("admin-teacher-ranking-note"),
    summary: document.getElementById("admin-teacher-summary"),
    statsContent: document.getElementById("admin-teacher-stats-content"),
    classSummary: document.getElementById("admin-teacher-class-summary"),
    classContent: document.getElementById("admin-teacher-class-content")
});

const setTeacherWorkspaceView = viewName => {
    const elements = getTeacherStatsElements();
    if (elements.directory) elements.directory.hidden = viewName !== "directory";
    if (elements.statsView) elements.statsView.hidden = viewName !== "stats";
    if (elements.classView) elements.classView.hidden = viewName !== "class";
    if (elements.toolbarContext) elements.toolbarContext.hidden = viewName === "directory";
    elements.managementTopbar?.classList.toggle("has-teacher-context", viewName !== "directory");
    if (viewName === "stats" && teacherStatsState.teacherName) {
        if (elements.statsTitle) elements.statsTitle.textContent = teacherStatsState.teacherName;
        if (elements.statsAvatar) {
            elements.statsAvatar.textContent = teacherStatsState.teacherName.trim().charAt(0).toUpperCase() || "G";
        }
        if (elements.toolbarSubtitle) elements.toolbarSubtitle.textContent = "Hoạt động giảng dạy và nhận xét học sinh";
    }
    document.getElementById("sec-gv")?.setAttribute("data-teacher-view", viewName);
    const managementBack = document.getElementById("admin-management-back");
    if (managementBack) {
        const backLabels = {
            directory: "Quay lại trang chủ",
            stats: "Quay lại danh sách giáo viên",
            class: "Quay lại thống kê giáo viên"
        };
        managementBack.setAttribute("aria-label", backLabels[viewName] || "Quay lại");
    }
    window.updateBackButtonVisibility?.();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
};

const formatTeacherDateInput = date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const parseTeacherDateInput = (value, endOfDay = false) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return 0;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return 0;
    return date.getTime();
};

const subtractTeacherPeriodMonths = (date, monthCount) => {
    const target = new Date(date.getFullYear(), date.getMonth() - monthCount, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(date.getDate(), lastDay));
    target.setHours(0, 0, 0, 0);
    return target;
};

const getTeacherPeriodRange = period => {
    const now = new Date();
    const endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    if (period === "all") return { startMs: 0, endMs: Number.POSITIVE_INFINITY };
    if (period === "custom") {
        return {
            startMs: parseTeacherDateInput(teacherStatsState.customStartDate),
            endMs: parseTeacherDateInput(teacherStatsState.customEndDate, true)
        };
    }
    const monthCount = TEACHER_STATS_PERIOD_MONTHS[period] || 1;
    return { startMs: subtractTeacherPeriodMonths(now, monthCount).getTime(), endMs };
};

const getTeacherRecordLessonDateMs = record => {
    const dateValue = String(record.date || "").trim();
    const vnMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateValue);
    if (vnMatch) {
        const day = Number(vnMatch[1]);
        const month = Number(vnMatch[2]);
        const year = Number(vnMatch[3]);
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date.getTime();
    }
    const isoMs = parseTeacherDateInput(dateValue);
    return isoMs || window.getRecordTimestampMs(record);
};

const formatTeacherPeriodDate = timestampMs => new Date(timestampMs).toLocaleDateString("vi-VN");

const getTeacherPeriodContextLabel = () => {
    if (teacherStatsState.period !== "custom") return TEACHER_STATS_PERIOD_LABELS[teacherStatsState.period];
    const { startMs, endMs } = getTeacherPeriodRange("custom");
    if (!startMs || !endMs) return TEACHER_STATS_PERIOD_LABELS.custom;
    return `khoảng từ ${formatTeacherPeriodDate(startMs)} đến ${formatTeacherPeriodDate(endMs)}`;
};

const filterTeacherRecordsByPeriod = (records, period) => {
    const { startMs, endMs } = getTeacherPeriodRange(period);
    return records.filter(record => {
        const lessonDateMs = getTeacherRecordLessonDateMs(record);
        return lessonDateMs >= startMs && lessonDateMs <= endMs;
    });
};

const getTeacherClassKey = record => window.makeDataKey(
    String(record.facility || "").trim(),
    String(record.className || "").trim()
);

const getTeacherSessionKey = record => {
    if (record.batchId) return `batch:${record.batchId}`;
    if (record.lessonInstanceId) return `lesson:${record.lessonInstanceId}`;
    return `legacy:${window.makeDataKey(record.date, record.shift)}`;
};

const getTeacherStudentKey = record => {
    if (record.studentId) return `id:${record.studentId}`;
    return `name:${normalizeTeacherStatsValue(record.studentName)}`;
};

const formatTeacherStatsDate = timestampMs => {
    if (!timestampMs) return "Chưa rõ";
    return new Date(timestampMs).toLocaleDateString("vi-VN");
};

const buildTeacherClassSummaries = records => {
    const classMap = new Map();
    records.forEach(record => {
        const className = String(record.className || "").trim();
        const facility = String(record.facility || "").trim();
        if (!className) return;

        const key = getTeacherClassKey(record);
        if (!classMap.has(key)) {
            classMap.set(key, {
                key,
                className,
                facility,
                records: [],
                sessionKeys: new Set(),
                studentKeys: new Set(),
                latestTimestamp: 0
            });
        }

        const summary = classMap.get(key);
        const timestampMs = getTeacherRecordLessonDateMs(record);
        summary.records.push(record);
        summary.sessionKeys.add(getTeacherSessionKey(record));
        const studentKey = getTeacherStudentKey(record);
        if (studentKey !== "name:") summary.studentKeys.add(studentKey);
        summary.latestTimestamp = Math.max(summary.latestTimestamp, timestampMs);
    });

    return [...classMap.values()]
        .map(summary => ({
            ...summary,
            sessionCount: summary.sessionKeys.size,
            studentCount: summary.studentKeys.size
        }))
        .sort((a, b) => b.sessionCount - a.sessionCount
            || b.latestTimestamp - a.latestTimestamp
            || b.studentCount - a.studentCount
            || window.formatClassName(a.className, a.facility)
                .localeCompare(window.formatClassName(b.className, b.facility), "vi"));
};

const renderTeacherStatsStatus = (container, type, message, canRetry = false) => {
    if (!container) return;
    const icon = type === "loading" ? "fa-spinner fa-spin" : type === "error" ? "fa-exclamation-circle" : "fa-folder-open";
    container.innerHTML = `
        <div class="admin-teacher-stats-status admin-teacher-stats-status-${type}" role="${type === "error" ? "alert" : "status"}">
            <i class="fas ${icon}" aria-hidden="true"></i>
            <span>${window.escapeHtml(message)}</span>
            ${canRetry ? '<button type="button" class="admin-teacher-retry" data-teacher-stats-retry>Thử lại</button>' : ""}
        </div>`;
};

const renderTeacherStatsSummary = (records, classSummaries) => {
    const summaryContainer = getTeacherStatsElements().summary;
    if (!summaryContainer) return;
    const sessionKeys = new Set();
    const studentKeys = new Set();
    records.forEach(record => {
        const classKey = getTeacherClassKey(record);
        sessionKeys.add(`${classKey}|${getTeacherSessionKey(record)}`);
        const studentKey = getTeacherStudentKey(record);
        if (studentKey !== "name:") studentKeys.add(`${classKey}|${studentKey}`);
    });
    summaryContainer.innerHTML = `
        <div class="admin-teacher-summary-item"><span>Lớp đã dạy</span><strong>${classSummaries.length} lớp</strong></div>
        <div class="admin-teacher-summary-item"><span>Tổng số buổi</span><strong>${sessionKeys.size} buổi</strong></div>
        <div class="admin-teacher-summary-item"><span>Học sinh đã nhận xét</span><strong>${studentKeys.size} học sinh</strong></div>`;
};

const renderTeacherStatsTable = classSummaries => {
    const content = getTeacherStatsElements().statsContent;
    if (!content) return;
    if (classSummaries.length === 0) {
        renderTeacherStatsStatus(content, "empty", `Chưa có nhận xét nào trong ${getTeacherPeriodContextLabel()}.`);
        return;
    }

    const rows = classSummaries.map((summary, index) => `
        <tr class="${index === 0 ? "admin-teacher-leading-class" : ""}">
            <td class="admin-teacher-rank" data-label="Hạng"><span class="admin-teacher-cell-value">${index + 1}</span></td>
            <td data-label="Lớp"><span class="admin-teacher-cell-value"><strong>${window.escapeHtml(window.formatClassName(summary.className, summary.facility))}</strong></span></td>
            <td class="admin-teacher-number" data-label="Số buổi"><span class="admin-teacher-cell-value">${summary.sessionCount} buổi</span></td>
            <td class="admin-teacher-number" data-label="HS nhận xét"><span class="admin-teacher-cell-value">${summary.studentCount} học sinh</span></td>
            <td class="admin-teacher-number" data-label="Gần nhất"><span class="admin-teacher-cell-value">${formatTeacherStatsDate(summary.latestTimestamp)}</span></td>
            <td class="admin-teacher-action" data-label="Thao tác"><button type="button" class="admin-teacher-open-class" data-teacher-class-key="${window.escapeHtml(summary.key)}">Mở lớp<i class="fas fa-arrow-right" aria-hidden="true"></i></button></td>
        </tr>`).join("");

    content.innerHTML = `
        <div class="admin-teacher-stats-table-wrap">
            <table class="admin-teacher-stats-table admin-teacher-class-table">
                <colgroup>
                    <col class="admin-teacher-class-rank-column">
                    <col class="admin-teacher-class-name-column">
                    <col class="admin-teacher-class-session-column">
                    <col class="admin-teacher-class-student-column">
                    <col class="admin-teacher-class-latest-column">
                    <col class="admin-teacher-class-action-column">
                </colgroup>
                <thead><tr><th>Hạng</th><th>Lớp</th><th>Số buổi</th><th>HS nhận xét</th><th>Gần nhất</th><th>Thao tác</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
};

const renderTeacherStats = () => {
    const filteredRecords = filterTeacherRecordsByPeriod(teacherStatsState.records, teacherStatsState.period);
    const classSummaries = buildTeacherClassSummaries(filteredRecords);
    teacherStatsState.classSummaries = classSummaries;
    const elements = getTeacherStatsElements();
    if (elements.rankingNote) {
        elements.rankingNote.textContent = `Xếp hạng theo số buổi dạy trong ${getTeacherPeriodContextLabel()}.`;
    }
    renderTeacherStatsSummary(filteredRecords, classSummaries);
    renderTeacherStatsTable(classSummaries);
};

const fetchTeacherStatsRecords = async teacherName => {
    const cacheKey = normalizeTeacherStatsValue(teacherName);
    const cached = teacherStatsCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < TEACHER_STATS_CACHE_MS) return cached.records;

    const snapshots = await window.withUiTimeout(
        Promise.all([
            getDocs(query(collection(db, "records"), where("teacher", "==", teacherName))),
            getDocs(query(collection(db, "records"), where("teacherName", "==", teacherName)))
        ]),
        undefined,
        "Tải thống kê giáo viên quá thời gian"
    );
    const recordsById = new Map();
    snapshots.forEach(snapshot => {
        snapshot.forEach(recordDoc => recordsById.set(recordDoc.id, { id: recordDoc.id, ...recordDoc.data() }));
    });
    const records = [...recordsById.values()];
    teacherStatsCache.set(cacheKey, { records, cachedAt: Date.now() });
    return records;
};

const loadTeacherStats = async teacherName => {
    const elements = getTeacherStatsElements();
    if (!teacherName || !elements.statsContent) return;
    teacherStatsState.requestId += 1;
    const requestId = teacherStatsState.requestId;
    teacherStatsState.teacherName = teacherName;
    teacherStatsState.period = "one-month";
    teacherStatsState.customStartDate = "";
    teacherStatsState.customEndDate = "";
    teacherStatsState.records = [];
    teacherStatsState.classSummaries = [];
    if (elements.periodSelect) elements.periodSelect.value = "one-month";
    if (elements.customPeriod) elements.customPeriod.hidden = true;
    if (elements.periodStart) elements.periodStart.value = "";
    if (elements.periodEnd) elements.periodEnd.value = "";
    if (elements.periodError) elements.periodError.hidden = true;
    if (elements.summary) elements.summary.innerHTML = "";
    setTeacherWorkspaceView("stats");
    renderTeacherStatsStatus(elements.statsContent, "loading", "Đang tải thống kê giáo viên...");

    try {
        const records = await fetchTeacherStatsRecords(teacherName);
        if (requestId !== teacherStatsState.requestId || teacherStatsState.teacherName !== teacherName) return;
        teacherStatsState.records = records;
        renderTeacherStats();
    } catch (error) {
        if (requestId !== teacherStatsState.requestId) return;
        renderTeacherStatsStatus(elements.statsContent, "error", "Không thể tải thống kê giáo viên. Vui lòng thử lại.", true);
        console.error("Không thể tải thống kê giáo viên:", error);
    }
};

const buildTeacherStudentSummaries = records => {
    const studentMap = new Map();
    records.forEach(record => {
        const studentName = String(record.studentName || "").trim();
        if (!studentName) return;
        const key = getTeacherStudentKey(record);
        if (!studentMap.has(key)) {
            studentMap.set(key, { key, studentName, records: [], latestTimestamp: 0, latestRecord: null });
        }
        const summary = studentMap.get(key);
        const timestampMs = getTeacherRecordLessonDateMs(record);
        summary.records.push(record);
        if (timestampMs >= summary.latestTimestamp) {
            summary.latestTimestamp = timestampMs;
            summary.latestRecord = record;
        }
    });
    return [...studentMap.values()]
        .map(summary => ({ ...summary, recordCount: summary.records.length }))
        .sort((a, b) => b.latestTimestamp - a.latestTimestamp || a.studentName.localeCompare(b.studentName, "vi"));
};

const openTeacherStudentEvaluation = studentKey => {
    const student = teacherStatsState.studentSummaries.find(summary => summary.key === studentKey);
    const classSummary = teacherStatsState.classSummaries.find(summary => summary.key === teacherStatsState.selectedClassKey);
    if (!student || !classSummary || typeof window.renderSoA2Global !== "function") {
        window.showModal?.("Không thể mở phiếu đánh giá của học sinh này. Vui lòng thử lại.", "error");
        return;
    }

    const latestRecord = student.latestRecord || {};
    const selectedStudent = {
        id: latestRecord.studentId || "",
        name: student.studentName,
        studentName: student.studentName,
        className: latestRecord.className || classSummary.className,
        facility: latestRecord.facility || classSummary.facility,
        category: latestRecord.category || ""
    };

    window.switchTab("quan-ly");
    const nameInput = document.getElementById("global-hs-search-input");
    const classInput = document.getElementById("selected-hs-class-a2");
    const idInput = document.getElementById("selected-hs-id-a2");
    if (nameInput) nameInput.value = selectedStudent.name;
    if (classInput) classInput.value = selectedStudent.className;
    if (idInput) idInput.value = selectedStudent.id;
    window.currentA2SelectedStudent = selectedStudent;

    const resultArea = document.getElementById("a2-result-area");
    if (resultArea) resultArea.dataset.returnContext = "teacher-class";
    window.renderSoA2Global();
};

const renderTeacherClassView = classSummary => {
    const elements = getTeacherStatsElements();
    if (!classSummary || !elements.classContent) return;
    teacherStatsState.selectedClassKey = classSummary.key;
    const displayClass = window.formatClassName(classSummary.className, classSummary.facility);
    if (elements.statsTitle) elements.statsTitle.textContent = `${displayClass} · ${teacherStatsState.teacherName}`;
    if (elements.toolbarSubtitle) {
        elements.toolbarSubtitle.textContent = `Học sinh đã được nhận xét trong ${getTeacherPeriodContextLabel()}`;
    }

    const students = buildTeacherStudentSummaries(classSummary.records);
    teacherStatsState.studentSummaries = students;
    if (elements.classSummary) {
        elements.classSummary.innerHTML = `
            <div class="admin-teacher-summary-item"><span>Số buổi đã dạy</span><strong>${classSummary.sessionCount} buổi</strong></div>
            <div class="admin-teacher-summary-item"><span>Học sinh đã nhận xét</span><strong>${students.length} học sinh</strong></div>
            <div class="admin-teacher-summary-item"><span>Tổng lượt nhận xét</span><strong>${classSummary.records.length} lượt</strong></div>`;
    }

    if (students.length === 0) {
        renderTeacherStatsStatus(elements.classContent, "empty", "Chưa có học sinh nào được nhận xét trong khoảng thời gian này.");
        setTeacherWorkspaceView("class");
        return;
    }

    const rows = students.map(student => {
        const latestContent = String(student.latestRecord?.content || "").replace(/tbc:|tbm:/gi, "").trim();
        return `
            <tr>
                <td data-label="Học sinh"><span class="admin-teacher-cell-value"><strong>${window.escapeHtml(student.studentName)}</strong></span></td>
                <td class="admin-teacher-number" data-label="Số lượt"><span class="admin-teacher-cell-value">${student.recordCount}</span></td>
                <td class="admin-teacher-number" data-label="Gần nhất"><span class="admin-teacher-cell-value">${formatTeacherStatsDate(student.latestTimestamp)}</span></td>
                <td data-label="Nội dung"><span class="admin-teacher-cell-value">${window.escapeHtml(latestContent || "Không có nội dung")}</span></td>
                <td class="admin-teacher-action" data-label="Thao tác"><button type="button" class="admin-teacher-view-evaluation" data-teacher-student-key="${window.escapeHtml(student.key)}">Xem nhận xét<i class="fas fa-arrow-right" aria-hidden="true"></i></button></td>
            </tr>`;
    }).join("");

    elements.classContent.innerHTML = `
        <div class="admin-teacher-stats-table-wrap">
            <table class="admin-teacher-stats-table admin-teacher-student-table">
                <colgroup>
                    <col class="admin-teacher-student-name-column">
                    <col class="admin-teacher-review-count-column">
                    <col class="admin-teacher-latest-date-column">
                    <col class="admin-teacher-latest-content-column">
                    <col class="admin-teacher-student-action-column">
                </colgroup>
                <thead><tr><th>Học sinh</th><th>Số lượt</th><th>Gần nhất</th><th>Nội dung gần nhất</th><th>Thao tác</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    setTeacherWorkspaceView("class");
};

const showTeacherDirectory = () => {
    teacherStatsState.requestId += 1;
    teacherStatsState.teacherName = "";
    teacherStatsState.selectedClassKey = "";
    teacherStatsState.studentSummaries = [];
    setTeacherWorkspaceView("directory");
};

const handleTeacherWorkspaceBack = () => {
    const teacherSection = document.getElementById("sec-gv");
    if (!teacherSection || teacherSection.style.display !== "block") return false;
    const currentView = teacherSection.getAttribute("data-teacher-view");
    if (currentView === "class") {
        setTeacherWorkspaceView("stats");
        return true;
    }
    if (currentView === "stats") {
        showTeacherDirectory();
        return true;
    }
    return false;
};

document.addEventListener("click", event => {
    const teacherButton = event.target.closest(".admin-teacher-summary-toggle");
    if (teacherButton) {
        loadTeacherStats(teacherButton.dataset.teacherName || "");
        return;
    }

    const classButton = event.target.closest(".admin-teacher-open-class");
    if (classButton) {
        const classSummary = teacherStatsState.classSummaries.find(summary => summary.key === classButton.dataset.teacherClassKey);
        if (classSummary) renderTeacherClassView(classSummary);
        return;
    }

    const evaluationButton = event.target.closest(".admin-teacher-view-evaluation");
    if (evaluationButton) {
        openTeacherStudentEvaluation(evaluationButton.dataset.teacherStudentKey || "");
        return;
    }

    if (event.target.closest("[data-teacher-stats-retry]") && teacherStatsState.teacherName) {
        teacherStatsCache.delete(normalizeTeacherStatsValue(teacherStatsState.teacherName));
        loadTeacherStats(teacherStatsState.teacherName);
    }
});

document.addEventListener("change", event => {
    if (event.target.id !== "admin-teacher-period") return;
    const elements = getTeacherStatsElements();
    const nextPeriod = event.target.value;
    if (nextPeriod === "custom") {
        const currentRange = getTeacherPeriodRange(teacherStatsState.period);
        if (elements.periodStart && !elements.periodStart.value) {
            elements.periodStart.value = formatTeacherDateInput(new Date(currentRange.startMs || Date.now()));
        }
        if (elements.periodEnd && !elements.periodEnd.value) {
            const endMs = Number.isFinite(currentRange.endMs) ? currentRange.endMs : Date.now();
            elements.periodEnd.value = formatTeacherDateInput(new Date(endMs));
        }
        if (elements.customPeriod) elements.customPeriod.hidden = false;
        elements.periodStart?.focus();
        return;
    }
    if (elements.customPeriod) elements.customPeriod.hidden = true;
    if (elements.periodError) elements.periodError.hidden = true;
    teacherStatsState.period = nextPeriod;
    renderTeacherStats();
});

document.addEventListener("click", event => {
    if (event.target.id !== "admin-teacher-period-apply") return;
    const elements = getTeacherStatsElements();
    const startDate = elements.periodStart?.value || "";
    const endDate = elements.periodEnd?.value || "";
    const startMs = parseTeacherDateInput(startDate);
    const endMs = parseTeacherDateInput(endDate, true);
    let errorMessage = "";
    if (!startMs || !endMs) errorMessage = "Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc.";
    else if (startMs > endMs) errorMessage = "Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.";
    if (errorMessage) {
        if (elements.periodError) {
            elements.periodError.textContent = errorMessage;
            elements.periodError.hidden = false;
        }
        return;
    }
    if (elements.periodError) elements.periodError.hidden = true;
    teacherStatsState.period = "custom";
    teacherStatsState.customStartDate = startDate;
    teacherStatsState.customEndDate = endDate;
    renderTeacherStats();
});

document.addEventListener("spt:admin-management-back", event => {
    if (handleTeacherWorkspaceBack()) event.preventDefault();
});

document.addEventListener("spt:admin-teacher-directory", showTeacherDirectory);

document.addEventListener("spt:return-to-teacher-class", () => {
    window.switchTab("dashboard", { restore: true, noScroll: true });
    setTeacherWorkspaceView("class");
    window.updateBackButtonVisibility?.();
});

const historyAccordionHandlers = new WeakMap();

const bindHistoryAccordion = container => {
    const previousHandler = historyAccordionHandlers.get(container);
    if (previousHandler) container.removeEventListener('click', previousHandler);

    const handleToggle = event => {
        const toggle = event.target.closest('.history-entry-toggle');
        if (!toggle || !container.contains(toggle)) return;

        const shouldExpand = toggle.getAttribute('aria-expanded') !== 'true';

        container.querySelectorAll('.history-entry-toggle[aria-expanded="true"]').forEach(openToggle => {
            openToggle.setAttribute('aria-expanded', 'false');
            const openDetails = document.getElementById(openToggle.getAttribute('aria-controls'));
            if (openDetails) openDetails.hidden = true;
        });

        toggle.setAttribute('aria-expanded', String(shouldExpand));
        const details = document.getElementById(toggle.getAttribute('aria-controls'));
        if (details) details.hidden = !shouldExpand;
    };

    container.addEventListener('click', handleToggle);
    historyAccordionHandlers.set(container, handleToggle);
};

window.viewStudentHistory = async (ten, source = 'home') => {
    const lSelect = document.getElementById("select-lop-gv");
    const lop = lSelect ? lSelect.value : "";
    if (!lop) return window.showModal("Chưa xác định được lớp!", "error");

    const panel = document.getElementById("class-side-panel");
    const title = document.getElementById("panel-main-title");
    const subTitle = document.getElementById("panel-sub-title");
    const content = document.getElementById("panel-content-list");
    const btnBack = document.getElementById("btn-panel-back");
    const pb = document.getElementById("panel-buttons");

    if (!panel || !content) return;

    panel.setAttribute('data-history-student', ten);

    if (title) title.textContent = "Lịch sử đánh giá";

    const escapeHtml = value => window.escapeHtml(String(value ?? ""));
    const studentInitial = escapeHtml(String(ten || "").trim().charAt(0).toUpperCase() || "H");

    // Đọc ghi chú hiện hành từ thẻ học sinh đang mở (nếu có)
    // *Lưu ý: Nếu bạn có nguồn dữ liệu ghi chú từ Firebase/API, bạn có thể override biến noteContent ở đây
    const card = document.getElementById(`card-${ten.replace(/\s/g, '')}`);
    const noteContent = card ? (card.getAttribute('data-note') || "") : "";

    if (subTitle) {
        let noteHtml = "";
        if (noteContent) {
            noteHtml = `
            <div class="history-note-box" id="history-note-content">
                <i class="fas fa-exclamation-triangle history-note-warning-icon" aria-hidden="true"></i>
                <div class="note-inner history-note-text">${escapeHtml(noteContent)}</div>
            </div>`;
        }

        subTitle.innerHTML = `
            <div class="history-student-summary">
                <span class="history-student-avatar" aria-hidden="true">${studentInitial}</span>
                <div class="history-student-meta">
                    <span class="history-student-name">${escapeHtml(ten)}</span>
                    <span class="history-student-class">Lớp ${escapeHtml(lop)}</span>
                </div>
                <span class="history-record-count" aria-live="polite">Đang tải</span>
                ${noteHtml}
            </div>
        `;
    }

    const kSelect = document.getElementById("select-khoi-gv");
    const khoi = kSelect ? kSelect.value : "";
    const fSelect = document.getElementById("select-facility-gv");
    const fac = fSelect ? fSelect.value : "";

    const goBack = () => {
        if (source === 'heThongCoSo' && fac && khoi && lop) {
            window.viewClassDetails(fac, khoi, lop);
        } else {
            window.closePanel();
        }
    };

    if (btnBack) {
        btnBack.style.display = "block";
        btnBack.removeEventListener('click', btnBack._backHandler);
        btnBack._backHandler = (e) => { e.preventDefault(); e.stopPropagation(); goBack(); };
        btnBack.addEventListener('click', btnBack._backHandler);
    }
    if (pb) pb.innerHTML = "";

    content.innerHTML = `<div class="history-status" role="status">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <span>Đang tải dữ liệu...</span>
    </div>`;

    const over = document.getElementById("side-panel-overlay");
    if (over) over.classList.add("active");
    panel.classList.add("active");

    try {
        const snap = await getDocs(query(collection(db, "records"), where("studentName", "==", ten), where("className", "==", lop)));
        const data = [];
        snap.forEach(d => data.push(d.data()));
        data.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        const recordCount = subTitle?.querySelector('.history-record-count');
        if (recordCount) recordCount.textContent = `${data.length} lượt đánh giá`;

        if (data.length === 0) {
            content.innerHTML = `<div class="history-status history-status-empty">
                <i class="fas fa-folder-open" aria-hidden="true"></i>
                <span>Học sinh này chưa có đánh giá nào.</span>
            </div>`;
            return;
        }

        const historyEntries = data.map((r, index) => {
            const contentText = (r.content || '').replace(/tbc:|tbm:/gi, '').trim();
            const commentHtml = r.comment ? window.renderCommentHtml(r.comment) : "";
            const detailsId = `history-entry-details-${index}`;
            return `
                <article class="history-entry">
                    <div class="history-entry-card">
                        <button type="button" class="history-entry-toggle" aria-expanded="false" aria-controls="${detailsId}">
                            <span class="history-entry-meta">
                                <time class="history-date"><i class="far fa-calendar-alt" aria-hidden="true"></i>${escapeHtml(r.date || "Chưa rõ ngày")}</time>
                                <span class="history-teacher"><i class="fas fa-chalkboard-teacher" aria-hidden="true"></i>${escapeHtml(r.teacher || "Chưa rõ giáo viên")}</span>
                            </span>
                            <span class="history-entry-summary">
                                <span class="history-entry-label">Nội dung</span>
                                <span class="history-entry-content">${escapeHtml(contentText || "Không có nội dung")}</span>
                            </span>
                            <i class="fas fa-chevron-down history-entry-chevron" aria-hidden="true"></i>
                        </button>
                        <div id="${detailsId}" class="history-entry-details" hidden>
                            <span class="history-entry-label">Nhận xét chi tiết</span>
                            ${commentHtml
                                ? `<div class="history-comment-body">${commentHtml}</div>`
                                : `<p class="history-entry-empty-detail">Không có nhận xét chi tiết.</p>`}
                        </div>
                    </div>
                </article>`;
        }).join("");

        content.innerHTML = `<div class="history-timeline">${historyEntries}</div>`;
        bindHistoryAccordion(content);
    } catch (e) {
        content.innerHTML = `<div class="history-status history-status-error" role="alert">
            <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
            <span>Không thể tải lịch sử đánh giá. Vui lòng thử lại.</span>
        </div>`;
        console.error("Unable to load student history", e);
    }

    /* Swipe right to go back */
    if (panel) {
        let touchstartX = 0;
        let touchendX = 0;
        const swipeHandler = (e) => {
            touchendX = e.changedTouches[0].screenX;
            if (touchendX - touchstartX > 80) goBack();
        };
        panel.removeEventListener('touchstart', panel._hsSwipeStart);
        panel.removeEventListener('touchend', panel._hsSwipeEnd);
        panel._hsSwipeStart = (e) => { touchstartX = e.changedTouches[0].screenX; };
        panel._hsSwipeEnd = swipeHandler;
        panel.addEventListener('touchstart', panel._hsSwipeStart, { passive: true });
        panel.addEventListener('touchend', panel._hsSwipeEnd, { passive: true });
    }
};

window.closePanel = () => {
    const o = document.getElementById("side-panel-overlay"); if (o) o.classList.remove("active");
    const p = document.getElementById("class-side-panel");
    if (p) {
        p.classList.remove("active");
        p.removeAttribute("data-history-student");
    }
};
