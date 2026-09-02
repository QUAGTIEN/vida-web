function isZaloBrowser() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /Zalo/i.test(userAgent);
}

document.addEventListener('DOMContentLoaded', () => {
    if (isZaloBrowser()) {
        const zaloBlocker = document.createElement('div');
        zaloBlocker.className = 'browser-compatibility-blocker';
        zaloBlocker.innerHTML = `
            <div class="browser-compatibility-content">
                <div class="browser-compatibility-warning" aria-hidden="true">⚠️</div>
                <h1>Vui lòng mở bằng Trình duyệt gốc!</h1>
                <p class="browser-compatibility-description">Trình duyệt của Zalo không hỗ trợ đầy đủ các tính năng lưu trữ của Hệ thống VIDA và có thể gây mất dữ liệu.</p>
                <div class="browser-compatibility-guide">
                    <p class="browser-compatibility-guide-title">👉 HƯỚNG DẪN:</p>
                    <p class="browser-compatibility-guide-text">Bấm vào biểu tượng dấu 3 chấm (⋮) ở góc trên bên phải màn hình Zalo, sau đó chọn "Mở bằng trình duyệt" (Open in Browser) để tiếp tục làm việc.</p>
                </div>
                <div class="browser-compatibility-options">
                    <div class="browser-compatibility-option">
                        <div class="browser-compatibility-browser-icon" aria-hidden="true">🌐</div>
                        <p>Chrome</p>
                    </div>
                    <div class="browser-compatibility-option">
                        <div class="browser-compatibility-browser-icon" aria-hidden="true">🧭</div>
                        <p>Safari</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(zaloBlocker);
        document.body.style.overflow = 'hidden';
    }
});

window.showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    const isError = type === 'error';
    toast.className = `app-toast ${isError ? 'app-toast-error' : 'app-toast-success'}`;

    const iconSvg = isError
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.196 0l6.518 11.292c1.154 1.999-.289 4.5-2.598 4.5H5.48c-2.309 0-3.752-2.501-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.938.938 0 1 0 0-1.876.938.938 0 0 0 0 1.876Z" clip-rule="evenodd" /></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.03-2.28a.75.75 0 1 0-1.06-1.06l-4.97 4.97-1.47-1.47a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l5.5-5.5Z" clip-rule="evenodd" /></svg>`;

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('is-visible');
    });

    setTimeout(() => {
        toast.classList.remove('is-visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

window.showGlobalLoading = (text = 'Đang tải...') => {
    const existing = document.getElementById('globalLoadingOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'globalLoadingOverlay';
    overlay.className = 'global-loading-overlay';
    overlay.innerHTML = `
        <div class="global-loading-card">
            <i class="fas fa-spinner fa-spin global-loading-spinner" aria-hidden="true"></i>
            <span>${text}</span>
        </div>
    `;
    document.body.appendChild(overlay);
};

window.hideGlobalLoading = () => {
    const overlay = document.getElementById('globalLoadingOverlay');
    if (overlay) overlay.remove();
};
