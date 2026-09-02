import {
    STUDENT_SEARCH_INDEX_VERSION,
    STUDENT_SEARCH_MIN_LENGTH
} from "../config/constants.js";
window.formatClassName = (className, facility) => {
    const rawClass = String(className || "");
    const classFacilityMatch = rawClass.match(/\bCS\s*(\d+)\b/i);
    const cleanedClass = rawClass
        .replace(/\s*CS\s*\d+\s*/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (classFacilityMatch) {
        return [cleanedClass, `CS${classFacilityMatch[1]}`].filter(Boolean).join(" ").trim();
    }

    const rawFacility = String(facility || "");
    if (!rawFacility || rawFacility === "undefined" || rawFacility === "null") {
        return cleanedClass;
    }

    const facilityNumberMatch = rawFacility.match(/\d+/);
    const normalizedFacility = facilityNumberMatch
        ? `CS${facilityNumberMatch[0]}`
        : rawFacility.replace(/cơ\s*sở/gi, "CS").replace(/\s+/g, "").toUpperCase();

    const facilityLabel = normalizedFacility.startsWith("CS") ? normalizedFacility : "";
    return [cleanedClass, facilityLabel].filter(Boolean).join(" ").trim();
};

window.normalizeSearchText = (value = "") => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

window.buildStudentSearchTerms = (studentName = "") => {
    const normalizedName = window.normalizeSearchText(studentName);
    if (!normalizedName) return [];

    const words = normalizedName.split(" ").filter(Boolean);
    const terms = new Set();
    words.forEach((_, startIndex) => {
        const suffix = words.slice(startIndex).join(" ");
        for (let length = STUDENT_SEARCH_MIN_LENGTH; length <= suffix.length; length += 1) {
            terms.add(suffix.slice(0, length));
        }
    });
    return [...terms].slice(0, 150);
};

window.getStudentSearchDocumentFields = (studentName = "") => ({
    searchNormalized: window.normalizeSearchText(studentName),
    searchTerms: window.buildStudentSearchTerms(studentName),
    searchIndexVersion: STUDENT_SEARCH_INDEX_VERSION
});

window.escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

window.getStructuredCommentParts = (comment = "") => {
    const raw = String(comment || "").trim();
    if (!raw) return [];

    const readText = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();
    const tmp = document.createElement("div");
    tmp.innerHTML = raw;

    const htmlItems = Array.from(tmp.querySelectorAll(".nx-item"));
    if (htmlItems.length > 0) {
        return htmlItems.map(item => {
            const labelEl = item.querySelector(".nx-label");
            const valueEl = item.querySelector(".nx-val");
            const labelText = readText(labelEl).replace(/[:：]\s*$/, "");
            let valueText = readText(valueEl);

            if (!valueText) {
                const fullText = readText(item);
                const escapedLabel = labelText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                valueText = labelText ? fullText.replace(new RegExp(`^${escapedLabel}\\s*[:：]?\\s*`, "i"), "").trim() : fullText;
            }

            return { label: labelText, value: valueText };
        }).filter(part => part.label || part.value);
    }

    let text = tmp.textContent || tmp.innerText || raw;
    text = text
        .replace(/\r\n?/g, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/\s*\|\s*/g, "\n")
        .trim();

    const knownLabels = [
        "trả bài cũ", "tra bai cu",
        "lý thuyết bài mới", "ly thuyet bai moi",
        "kỹ năng vận dụng", "ky nang van dung",
        "dặn dò", "dan do",
        "nhận xét", "nhan xet"
    ];
    const labelPattern = knownLabels
        .map(label => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");

    if (labelPattern) {
        text = text.replace(new RegExp(`\\s*(${labelPattern})\\s*[:：.]`, "gi"), "\n$1:");
    }

    return text.split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const match = line.match(/^([^:：]{1,48})[:：]\s*(.*)$/);
            return match
                ? { label: match[1].trim(), value: match[2].trim() }
                : { label: "", value: line };
        })
        .filter(part => part.label || part.value);
};

window.commentToPlainText = (comment = "") => {
    return window.getStructuredCommentParts(comment)
        .map(part => part.label ? `${part.label}: ${part.value}`.trim() : part.value)
        .join("\n");
};

window.commentPlainTextToHtml = (comment = "") => {
    return window.getStructuredCommentParts(comment)
        .map(part => {
            const labelHtml = part.label ? `<span class="nx-label">${window.escapeHtml(part.label)}:</span> ` : "";
            return `<div class="nx-item">${labelHtml}<span class="nx-val">${window.escapeHtml(part.value)}</span></div>`;
        })
        .join("");
};

window.renderCommentHtml = (comment = "") => {
    const html = window.commentPlainTextToHtml(comment);
    return html || "";
};

window.jsArg = (value) => JSON.stringify(String(value ?? ""))
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

window.normalizeEntityName = (value) => String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
