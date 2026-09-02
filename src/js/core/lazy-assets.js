const assetPromises = new Map();

const loadScriptOnce = ({ key, src, globalName }) => {
    if (globalName && globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
    if (assetPromises.has(key)) return assetPromises.get(key);

    const promise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-spt-asset="${key}"]`);
        const script = existing || document.createElement("script");
        const handleLoad = () => {
            if (!globalName || globalThis[globalName]) resolve(globalName ? globalThis[globalName] : true);
            else reject(new Error(`Thư viện ${key} đã tải nhưng chưa sẵn sàng.`));
        };
        const handleError = () => reject(new Error(`Không thể tải thư viện ${key}.`));

        script.addEventListener("load", handleLoad, { once: true });
        script.addEventListener("error", handleError, { once: true });
        if (!existing) {
            script.src = src;
            script.async = true;
            script.dataset.sptAsset = key;
            document.head.appendChild(script);
        }
    }).catch(error => {
        assetPromises.delete(key);
        document.querySelector(`script[data-spt-asset="${key}"]`)?.remove();
        throw error;
    });

    assetPromises.set(key, promise);
    return promise;
};

export const ensureExcelAssets = async () => {
    await loadScriptOnce({
        key: "exceljs",
        src: "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js",
        globalName: "ExcelJS"
    });
    await loadScriptOnce({
        key: "file-saver",
        src: "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js",
        globalName: "saveAs"
    });
};

export const ensureHtml2Canvas = () => loadScriptOnce({
    key: "html2canvas",
    src: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    globalName: "html2canvas"
});

export const ensureChartJs = () => loadScriptOnce({
    key: "chartjs",
    src: "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js",
    globalName: "Chart"
});
