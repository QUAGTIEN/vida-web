import { ensureHtml2Canvas } from "../core/lazy-assets.js";

window.openExportModal = () => {
    const em = document.getElementById('exportModal');
    if (em) {
        em.style.display = 'flex';
        const rbAll = document.querySelector('input[name="exportScope"][value="all"]');
        if (rbAll) rbAll.checked = true;
        window.toggleMonthSelect();
    }
};

window.closeExportModal = () => {
    const em = document.getElementById('exportModal');
    if (em) em.style.display = 'none';
};

window.closePreviewModal = () => {
    const ipm = document.getElementById('imagePreviewModal');
    if (ipm) ipm.style.display = 'none';
    window.currentPreviewCanvas = null;
    window.currentPreviewCanvases = [];
    window.currentPreviewPdfBlob = null;
    window.currentPreviewMode = "image";
};

window.toggleMonthSelect = () => {
    const scope = document.querySelector('input[name="exportScope"]:checked');
    if (!scope) return;
    const monthBox = document.getElementById('exportMonthRange');
    if (monthBox) monthBox.style.display = scope.value === 'month' ? 'block' : 'none';
};

window.processExport = (format) => {
    const scope = document.querySelector('input[name="exportScope"]:checked').value;
    let dataToExport = [];
    let monthLabel = "";

    if (scope === 'all') {
        dataToExport = window.currentA2Data;
    } else if (scope === 'month') {
        const selectedMonth = parseInt(document.getElementById('exportMonthSelect').value);

        dataToExport = window.currentA2Data.filter(item => {
            if (!item.date) return false;
            const m = parseInt(item.date.split('/')[1]);
            return m === selectedMonth;
        });

        if (dataToExport.length === 0) {
            return window.showModal(`Không có dữ liệu buổi học nào trong Tháng ${selectedMonth}!`, "error");
        }
        monthLabel = ` THÁNG ${selectedMonth}`;
    }
    // ... (các code phía trên của hàm window.processExport)
    window.closeExportModal();
    setTimeout(() => {
        window.previewExport(format === 'pdf', dataToExport, monthLabel);
    }, 300);
}; // <--- ĐÂY LÀ DẤU ĐÓNG NGOẶC QUAN TRỌNG ĐANG BỊ THIẾU TRONG ẢNH CỦA ANH

window.preparePagedExportArea = (captureArea) => {
    const blocks = Array.from(captureArea.querySelectorAll('.khu-vuc-nhan-xet'));
    if (blocks.length === 0) return captureArea;

    const children = Array.from(captureArea.children);
    const firstBlockIndex = children.findIndex(el => el.classList.contains('khu-vuc-nhan-xet'));
    const introNodes = children.slice(0, firstBlockIndex).map(el => el.cloneNode(true));
    const footerNode = children[children.length - 1]?.classList.contains('khu-vuc-nhan-xet') ? null : children[children.length - 1].cloneNode(true);
    const pageHeight = 1414;

    const pagedArea = document.createElement('div');
    pagedArea.id = 'paged-export-area';
    pagedArea.style.cssText = 'width:1000px;background:#f5faff;color:#000;font-family:Times New Roman,serif;';
    captureArea.replaceWith(pagedArea);

    const createPage = () => {
        const page = document.createElement('div');
        page.className = 'export-a4-page';
        page.style.cssText = 'width:1000px;min-height:1414px;box-sizing:border-box;padding:40px;margin:0 0 26px 0;background:#fff;color:#000;font-family:Times New Roman,serif;page-break-after:always;break-after:page;overflow:visible;';
        introNodes.forEach(node => page.appendChild(node.cloneNode(true)));
        pagedArea.appendChild(page);
        return page;
    };

    let page = createPage();
    blocks.forEach(block => {
        const clonedBlock = block.cloneNode(true);
        page.appendChild(clonedBlock);
        if (page.scrollHeight > pageHeight && page.querySelectorAll('.khu-vuc-nhan-xet').length > 1) {
            page.removeChild(clonedBlock);
            page = createPage();
            page.appendChild(clonedBlock);
        }
    });

    if (footerNode) {
        page.appendChild(footerNode);
        if (page.scrollHeight > pageHeight && page.querySelectorAll('.khu-vuc-nhan-xet').length > 0) {
            page.removeChild(footerNode);
            page = createPage();
            page.appendChild(footerNode);
        }
    }

    return pagedArea;
};

window.renderExportPagesToCanvases = async (pagedArea) => {
    const pages = pagedArea.classList?.contains('export-a4-page') ? [pagedArea] : Array.from(pagedArea.querySelectorAll('.export-a4-page'));
    const canvases = [];
    for (const page of pages) {
        canvases.push(await window.html2canvas(page, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false
        }));
    }
    return canvases;
};

window.createPdfBlobFromCanvases = (canvases) => {
    const pageW = 595.28;
    const pageH = 841.89;
    const margin = 24;
    const objects = [];

    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    const kids = [];

    canvases.forEach((canvas, index) => {
        const pageId = 3 + index * 3;
        const imageId = pageId + 1;
        const contentId = pageId + 2;
        kids.push(`${pageId} 0 R`);

        const imageBinary = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
        const maxW = pageW - margin * 2;
        const maxH = pageH - margin * 2;
        const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
        const drawW = canvas.width * ratio;
        const drawH = canvas.height * ratio;
        const x = (pageW - drawW) / 2;
        const y = pageH - margin - drawH;
        const content = `q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im${index} Do Q`;

        objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`;
        objects[imageId] = `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBinary.length} >>\nstream\n${imageBinary}\nendstream`;
        objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    });

    objects[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${canvases.length} >>`;

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (let i = 1; i < objects.length; i++) {
        offsets[i] = pdf.length;
        pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: 'application/pdf' });
};

window.previewExport = async (isPrint = false, dataToExport, monthLabel = "") => {
    if (!dataToExport || dataToExport.length === 0) return window.showModal("Không có dữ liệu!", "error");

    const studentName = dataToExport[0].studentName;
    const className = dataToExport[0].className;
    const facility = dataToExport[0].facility || "Cơ sở 1";

    let printHtml = `
        <div id="capture-area" style="width: 1000px; padding: 40px; background: white; color: black; font-family: 'Times New Roman', serif;">
            <div style="text-align: center; margin-bottom: 30px; display: flex; align-items: center; justify-content: center;">
                <div>
                    <h2 style="margin: 0; font-size: 26px; font-weight: bold; text-transform: uppercase; color: #0066d6;">TRUNG TÂM NGOẠI NGỮ VIDA</h2>
                    <h3 style="margin: 10px 0 0 0; font-size: 20px; font-weight: bold; text-transform: uppercase;">PHIẾU ĐÁNH GIÁ HỌC TẬP${monthLabel}</h3>
                </div>
            </div>
            <div style="margin-bottom: 30px; border: 2px solid #0066d6; padding: 15px; background: #f5faff; border-radius: 12px; text-align: left;">
                <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 18px; color: #16324f;">Họ tên học sinh: ${studentName.toUpperCase()}</p>
                <p style="margin: 0; font-weight: bold; font-size: 18px; color: #16324f;">Lớp: ${className}</p>
            </div>
    `;

    const lessonsPerBlock = 6;
    const blocks = [];
    for (let i = 0; i < dataToExport.length; i += lessonsPerBlock) blocks.push(dataToExport.slice(i, i + lessonsPerBlock));

    blocks.forEach(block => {
        const getInvisibleCellsExport = () => { return '<td style="border: none !important; background: transparent !important;"></td>'.repeat(lessonsPerBlock - block.length); };
        const exportDataColWidth = (88 / lessonsPerBlock).toFixed(2);

        printHtml += `
            <div class="khu-vuc-nhan-xet" style="page-break-inside: avoid; break-inside: avoid; margin-bottom: 30px;">
                <table style="width: 100%; border-collapse: collapse; text-align: center; border: 2px solid #dcebfa; table-layout: fixed; word-wrap: break-word;">
                    <colgroup>
                        <col style="width: 12%;">
                        ${Array.from({ length: lessonsPerBlock }).map(() => `<col style="width: ${exportDataColWidth}%;">`).join('')}
                    </colgroup>
                    <tbody>
                        <tr>
                            <th style="background: #eaf4ff !important; color: #16324f !important; border: 1px solid #dcebfa; padding: 12px; font-weight: bold; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact;">THÁNG</th>
                            ${block.map(r => {
            let m = parseInt(r.date.split('/')[1]);
            return `<th style="border: 1px solid #dcebfa; padding: 12px; background-color: #f5faff !important; color: #16324f !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: bold; font-size: 18px;">THÁNG ${m}</th>`;
        }).join('')}${getInvisibleCellsExport()}
                        </tr>
                        <tr>
                            <th style="background: #eaf4ff !important; color: #16324f !important; border: 1px solid #dcebfa; padding: 12px; font-weight: bold; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact;">NGÀY</th>
                            ${block.map(r => `<td style="border: 1px solid #dcebfa; padding: 12px; font-weight: bold; font-size: 16px; color: #16324f; text-align: center; vertical-align: middle;">${r.date}</td>`).join('')}${getInvisibleCellsExport()}
                        </tr>
                        <tr>
                            <th style="background: #eaf4ff !important; color: #16324f !important; border: 1px solid #dcebfa; padding: 12px; font-weight: bold; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact;">NỘI<br>DUNG</th>
                            ${block.map(r => `<td style="border: 1px solid #dcebfa; padding: 12px; font-size: 16px; text-align: center; vertical-align: middle;">${(r.content || '').replace(/tbc:|tbm:/gi, '').trim()}</td>`).join('')}${getInvisibleCellsExport()}
                        </tr>
                        <tr>
                            <th style="background: #eaf4ff !important; color: #16324f !important; border: 1px solid #dcebfa; padding: 12px; font-weight: bold; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact;">NHẬN<br>XÉT</th>
                            ${block.map(r => `<td class="eval-comment-cell" style="border: 1px solid #dcebfa; padding: 12px; font-size: 16px; text-align: center; vertical-align: middle;">${window.renderCommentHtml(r.comment)}</td>`).join('')}${getInvisibleCellsExport()}
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    });

    printHtml += `
            <div style="text-align: center; margin-top: 40px; font-style: italic; color: #61758a; font-size: 16px;">
                <p>Hệ thống Đánh giá - VIDA (Ngày in: ${new Date().toLocaleDateString('vi-VN')})</p>
            </div>
        </div>
    `;

    try {
        await ensureHtml2Canvas();

        const oldSandbox = document.getElementById('image-render-sandbox');
        if (oldSandbox) document.body.removeChild(oldSandbox);

        const sandbox = document.createElement('div');
        sandbox.id = 'image-render-sandbox';
        sandbox.innerHTML = printHtml;
        // ZALO FIX: phải visible mới chụp được, dùng opacity=0 thay vì top:-9999
        sandbox.style.position = 'fixed';
        sandbox.style.top = '0';
        sandbox.style.left = '0';
        sandbox.style.width = '1000px';
        sandbox.style.backgroundColor = '#ffffff';
        sandbox.style.zIndex = '-9999';
        sandbox.style.opacity = '0';
        sandbox.style.pointerEvents = 'none';

        document.body.appendChild(sandbox);

        await Promise.all(Array.from(sandbox.querySelectorAll('img')).map(img => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
            });
        }));

        // Tăng timeout lên 500ms để Zalo browser kịp render font
        await new Promise(r => setTimeout(r, 500));

        // Vẽ ảnh chất lượng cao chung cho cả PNG và PDF
        const captureArea = sandbox.querySelector('#capture-area');
        const pagedArea = window.preparePagedExportArea(captureArea);
        if (pagedArea !== captureArea && captureArea.isConnected) captureArea.replaceWith(pagedArea);

        let canvases = [];
        let canvas;
        try {
            canvases = await window.renderExportPagesToCanvases(pagedArea);
            canvas = canvases[0];
            window.currentPreviewCanvases = canvases;
            window.currentPreviewCanvas = canvas || null;
            window.currentPreviewPdfBlob = canvases.length ? window.createPdfBlobFromCanvases(canvases) : null;
        } catch (renderErr) {
            console.error('[html2canvas] Lỗi render:', renderErr);
            // Dọn dẹp và thông báo
            if (document.body.contains(sandbox)) document.body.removeChild(sandbox);
            window.showModal("Lỗi khi tạo ảnh xem trước! (" + renderErr.message + ")", "error");
            return;
        }

        if (isPrint) {
            window.currentPreviewMode = "pdf";
            const pic = document.getElementById('previewImageContainer');
            if (pic) {
                pic.innerHTML = `<div style="background:#fff;border-radius:12px;padding:22px;text-align:center;color:#16324f;"><i class="fas fa-file-pdf" style="font-size:42px;color:#dc2626;margin-bottom:12px;"></i><div style="font-weight:900;font-size:1.05rem;">PDF đã được tạo</div><div style="font-size:0.9rem;color:#61758a;margin-top:6px;">Bạn có thể tải file hoặc chia sẻ bằng nút bên dưới.</div></div>`;
            }
            window.updatePreviewModalActions?.("pdf", canvases.length);
            const ipm = document.getElementById('imagePreviewModal');
            if (ipm) ipm.style.display = 'flex';
            if (document.body.contains(sandbox)) document.body.removeChild(sandbox);
            return;
            // XỬ LÝ XUẤT PDF: In trực tiếp bằng HTML để CSS page-break hoạt động chính xác thay vì in ảnh bị đứt ngang
        } else {
            // XỬ LÝ XUẤT ẢNH ZALO
            window.currentPreviewCanvas = canvas;
            const dataUrl = canvas.toDataURL("image/png");

            const img = document.createElement('img');
            img.src = dataUrl;
            img.style.maxWidth = "100%";
            img.style.borderRadius = "8px";
            img.style.boxShadow = "0 4px 15px rgba(0,82,184,0.08)";
            // Nhấn giữ trên mobile để lưu/copy
            img.style.webkitTouchCallout = 'default';
            img.style.userSelect = 'auto';

            const pic = document.getElementById('previewImageContainer');
            if (pic) {
                pic.innerHTML = '';
                pic.appendChild(img);

                // Thêm hướng dẫn nhấn giữ cho mobile
                const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
                if (isMobile) {
                    const hint = document.createElement('p');
                    hint.style.cssText = 'margin-top:12px; color:#61758a; font-size:0.88rem; text-align:center; font-style:italic;';
                    hint.innerHTML = '📌 Nhấn giữ vào ảnh 2 giây → chọn <b>Lưu ảnh</b> hoặc <b>Sao chép</b> để gửi Zalo';
                    pic.appendChild(hint);
                }
            }

            window.currentPreviewMode = "image";
            if (pic && canvases.length > 1) {
                pic.innerHTML = '';
                canvases.forEach((pageCanvas, index) => {
                    const pageLabel = document.createElement('div');
                    pageLabel.style.cssText = 'font-weight:800;color:#16324f;margin:8px 0 10px;text-align:left;';
                    pageLabel.textContent = `Ảnh ${index + 1}/${canvases.length}`;
                    const pageImg = document.createElement('img');
                    pageImg.src = pageCanvas.toDataURL("image/png");
                    pageImg.style.maxWidth = "100%";
                    pageImg.style.borderRadius = "8px";
                    pageImg.style.boxShadow = "0 4px 15px rgba(0,82,184,0.08)";
                    pageImg.style.marginBottom = "18px";
                    pageImg.style.webkitTouchCallout = 'default';
                    pageImg.style.userSelect = 'auto';
                    pic.appendChild(pageLabel);
                    pic.appendChild(pageImg);
                });
            }
            window.updatePreviewModalActions?.("image", canvases.length);

            const ipm = document.getElementById('imagePreviewModal');
            if (ipm) ipm.style.display = 'flex';
        }

        // Dọn dẹp DOM
        if (document.body.contains(sandbox)) document.body.removeChild(sandbox);

    } catch (e) {
        console.error('[previewExport] Lỗi không xác định:', e);
        window.showModal("Lỗi khi tạo ảnh xem trước! (" + e.message + ")", "error");
    }
};

window.updatePreviewModalActions = (mode = "image", pageCount = 1) => {
    const modal = document.getElementById('imagePreviewModal');
    if (!modal) return;
    const title = modal.querySelector('.modal-header h3');
    const copyBtn = modal.querySelector('button[onclick="window.copyPreviewImage()"]');
    const downloadBtn = modal.querySelector('button[onclick="window.downloadPreviewImage()"]');
    let shareBtn = modal.querySelector('button[onclick="window.sharePreviewFile()"]');
    const footer = modal.querySelector('.modal-footer');

    if (title) title.textContent = mode === "pdf" ? "PDF Phiếu Đánh Giá" : "Hình ảnh Phiếu Đánh Giá";
    if (copyBtn) {
        copyBtn.style.display = mode === "pdf" ? "none" : "";
        copyBtn.innerHTML = '<i class="fas fa-copy me-2"></i>Copy ảnh';
    }
    if (downloadBtn) {
        downloadBtn.innerHTML = mode === "pdf"
            ? '<i class="fas fa-download me-2"></i>Tải PDF'
            : `<i class="fas fa-download me-2"></i>Tải ${pageCount > 1 ? pageCount + ' ảnh' : 'về máy'}`;
    }
    if (!shareBtn && footer) {
        shareBtn = document.createElement('button');
        shareBtn.className = 'btn btn-info fw-bold px-4 text-white';
        shareBtn.setAttribute('onclick', 'window.sharePreviewFile()');
        footer.insertBefore(shareBtn, downloadBtn || null);
    }
    if (shareBtn) {
        shareBtn.style.display = "";
        shareBtn.innerHTML = mode === "pdf"
            ? '<i class="fas fa-share-alt me-2"></i>Chia sẻ PDF'
            : '<i class="fas fa-share-alt me-2"></i>Chia sẻ';
    }
};

window.copyPreviewImage = async () => {
    const canvasToCopy = (window.currentPreviewCanvases && window.currentPreviewCanvases[0]) || window.currentPreviewCanvas;
    if (!canvasToCopy) return;

    canvasToCopy.toBlob(async (blob) => {
        if (!blob) { window.showModal("Lỗi khi tạo file ảnh!", "error"); return; }

        const file = new File([blob], `PhieuDanhGia_${Date.now()}.png`, { type: 'image/png' });

        // 1. Ưu tiên Web Share API (hoạt động cả trên Zalo browser)
        if (false && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'Phiếu Đánh Giá',
                    text: 'Phiếu đánh giá học tập - VIDA'
                });
                return; // Thành công → xong
            } catch (shareErr) {
                if (shareErr.name !== 'AbortError') {
                    console.warn('[Share API] lỗi:', shareErr);
                }
                // Người dùng hủy hoặc lỗi → thử clipboard
            }
        }

        // 2. Thử Clipboard API (hoạt động trên Chrome desktop / Safari 13.1+)
        if (navigator.clipboard && navigator.clipboard.write) {
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                window.showModal("Đã copy ảnh thành công!", "success");
                return;
            } catch (clipErr) {
                console.warn('[Clipboard API] không hỗ trợ:', clipErr);
            }
        }

        // 3. Fallback cuối: Hiển thị ảnh trong modal với hướng dẫn nhấn giữ
        const pic = document.getElementById('previewImageContainer');
        if (pic) {
            // Đảm bảo ảnh đã có trong modal, thêm hướng dẫn nếu chưa có
            const existingHint = pic.querySelector('.zalo-share-hint');
            if (!existingHint) {
                const hint = document.createElement('div');
                hint.className = 'zalo-share-hint';
                hint.style.cssText = 'margin-top:16px; background:#fff3cd; border:1px solid #ffc107; border-radius:10px; padding:12px 16px; font-size:0.9rem; color:#7d5a00; text-align:center; line-height:1.6;';
                hint.innerHTML = '📌 <b>Nhấn giữ vào ảnh 2 giây</b> để Sao chép hoặc Lưu về máy, sau đó mở Zalo và dán ảnh vào.';
                pic.appendChild(hint);
            }
        }

    }, 'image/png');
};

window.getPreviewImageFiles = async () => {
    const canvases = window.currentPreviewCanvases?.length ? window.currentPreviewCanvases : [window.currentPreviewCanvas].filter(Boolean);
    const files = [];
    for (let i = 0; i < canvases.length; i++) {
        const blob = await new Promise(resolve => canvases[i].toBlob(resolve, 'image/png'));
        if (blob) files.push(new File([blob], `PhieuDanhGia_${i + 1}.png`, { type: 'image/png' }));
    }
    return files;
};

window.sharePreviewFile = async () => {
    try {
        let files = [];
        if (window.currentPreviewMode === "pdf") {
            if (!window.currentPreviewPdfBlob) return window.showModal("Chưa có file PDF để chia sẻ.", "error");
            files = [new File([window.currentPreviewPdfBlob], `PhieuDanhGia_${Date.now()}.pdf`, { type: 'application/pdf' })];
        } else {
            files = await window.getPreviewImageFiles();
        }

        if (navigator.canShare && navigator.canShare({ files })) {
            await navigator.share({
                files,
                title: 'Phiếu Đánh Giá',
                text: 'Phiếu đánh giá học tập - VIDA'
            });
            return;
        }
        window.showModal("Thiết bị/trình duyệt này chưa hỗ trợ chia sẻ trực tiếp. Bạn có thể tải file về máy rồi gửi thủ công.", "info");
    } catch (err) {
        if (err?.name !== 'AbortError') {
            console.error('[sharePreviewFile]', err);
            window.showModal("Không thể mở chia sẻ: " + (err.message || ""), "error");
        }
    }
};

window.downloadPreviewImage = () => {
    if (window.currentPreviewMode === "pdf") {
        if (!window.currentPreviewPdfBlob) return;
        const link = document.createElement('a');
        link.download = `PhieuDanhGia_${Date.now()}.pdf`;
        link.href = URL.createObjectURL(window.currentPreviewPdfBlob);
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        return;
    }

    const canvases = window.currentPreviewCanvases?.length ? window.currentPreviewCanvases : [window.currentPreviewCanvas].filter(Boolean);
    canvases.forEach((pageCanvas, index) => {
        const link = document.createElement('a');
        link.download = `PhieuDanhGia_${index + 1}.png`;
        link.href = pageCanvas.toDataURL("image/png");
        link.click();
    });
};
