document.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver(() => {
        const areaCards = document.getElementById("area-cards");
        const filter4Bars = document.getElementById("filter-4-bars");
        const toggleBtn = document.getElementById("toggle-4-bars-btn");

        if (
            window.innerWidth <= 768
            && areaCards
            && areaCards.innerHTML.trim() !== ""
            && !areaCards.querySelector("#empty-card-msg")
        ) {
            if (filter4Bars) filter4Bars.style.display = "none";
            if (toggleBtn) toggleBtn.style.display = "block";
        }
    });

    const areaCardsNode = document.getElementById("area-cards");
    if (areaCardsNode) {
        observer.observe(areaCardsNode, { childList: true, subtree: true });
    }
    window.updateBackButtonVisibility?.();
});

window.toggle4Bars = function () {
    document.getElementById("filter-4-bars").style.display = "block";
    document.getElementById("toggle-4-bars-btn").style.display = "none";
};

window.goToWizardStep = function (step) {
    if (window.innerWidth <= 768) {
        document.body.setAttribute("data-wizard-step", step);
        if (step === 3) {
            document.getElementById("filter-4-bars").style.display = "block";
            document.getElementById("toggle-4-bars-btn").style.display = "none";
        }
    }
    window.updateBackButtonVisibility?.();
    window.scheduleSaveAppState?.();
};

window.wizardBack = function () {
    const currentStep = parseInt(document.body.getAttribute("data-wizard-step") || "1", 10);
    if (currentStep > 1) {
        window.goToWizardStep(currentStep - 1);
    }
};

window.toggleFilterMobile = function () {
    const filterArea = document.getElementById("a2-filter-area");
    const searchArea = document.getElementById("a2-search-area");
    filterArea.classList.toggle("show-filter");
    if (filterArea.classList.contains("show-filter")) {
        searchArea.classList.add("hide-search");
    } else {
        searchArea.classList.remove("hide-search");
    }
};
