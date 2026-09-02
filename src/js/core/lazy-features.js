const featurePromises = new Map();

const loadFeatureOnce = (key, importer) => {
    if (!featurePromises.has(key)) {
        featurePromises.set(key, importer().catch(error => {
            featurePromises.delete(key);
            throw error;
        }));
    }
    return featurePromises.get(key);
};

export const ensureDashboardFeature = () => loadFeatureOnce(
    "dashboard",
    () => import("../features/dashboard.js?v=20260902-startup-performance-1")
);

export const ensureDataCenterFeature = () => loadFeatureOnce(
    "data-center",
    () => import("../features/data-center.js?v=20260902-startup-performance-1")
);

export const ensureSystemListFeature = () => loadFeatureOnce(
    "system-list",
    () => import("../features/system-list.js?v=20260902-startup-performance-1")
);

export const ensureExportFeature = () => loadFeatureOnce(
    "export",
    () => import("../features/export.js?v=20260902-startup-performance-1")
);
