/* iOS focus zoom is separate from CSS sizing. Keep the authored typography and
 * cap only native field focus; never permanently disable intentional pinch zoom.
 * Loaded before the app so login, dynamic fields and modal focus are covered. */
(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!isIOS || !viewport) return;

    const nonTextTypes = new Set(['button', 'submit', 'reset', 'image', 'hidden',
        'checkbox', 'radio', 'file', 'range', 'color']);
    const CANCELLED_TAP_DELAY = 500;
    let originalContent = null;
    let guardedContent = null;
    let cleanupTimer;
    let pinching = false;

    const fieldFor = (target) => {
        if (!(target instanceof Element)) return null;
        const field = target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
            || target.closest('label')?.control;
        if (!field || field.disabled || field.readOnly) return null;
        if (field.tagName === 'INPUT' && nonTextTypes.has(field.type)) return null;
        return field;
    };

    const restore = () => {
        clearTimeout(cleanupTimer);
        // Do not overwrite a viewport update made by another owner.
        if (originalContent !== null && viewport.getAttribute('content') === guardedContent) {
            viewport.setAttribute('content', originalContent);
        }
        originalContent = null;
        guardedContent = null;
    };

    const guardFocus = () => {
        if (pinching) return;
        clearTimeout(cleanupTimer);
        if (originalContent !== null) return;
        originalContent = viewport.getAttribute('content') || '';
        const scale = window.visualViewport?.scale || 1;
        guardedContent = originalContent.split(',')
            .filter(part => !/^\s*maximum-scale\s*=/i.test(part))
            .concat(`maximum-scale=${scale}`).join(',');
        viewport.setAttribute('content', guardedContent);
    };

    const syncFocus = () => {
        if (fieldFor(document.activeElement)) guardFocus();
        else restore();
    };

    const onPress = (event) => {
        if (!event.isPrimary && event.type === 'pointerdown') return;
        if (!fieldFor(event.target)) return;
        // Run BEFORE the browser focuses the field, not after it has zoomed.
        guardFocus();
        cleanupTimer = setTimeout(syncFocus, CANCELLED_TAP_DELAY);
    };

    document.addEventListener('pointerdown', onPress, { capture: true, passive: true });
    document.addEventListener('touchstart', (event) => {
        if (event.touches.length > 1) {
            pinching = true;
            restore();
        } else onPress(event);
    }, { capture: true, passive: true });
    document.addEventListener('touchend', (event) => {
        if (event.touches.length === 0) pinching = false;
    }, { capture: true, passive: true });
    document.addEventListener('touchcancel', () => {
        pinching = false;
        restore();
    }, { capture: true, passive: true });
    document.addEventListener('gesturestart', () => {
        pinching = true;
        restore();
    }, { capture: true, passive: true });
    document.addEventListener('gestureend', () => { pinching = false; }, { passive: true });
    document.addEventListener('focusin', syncFocus, true);
    document.addEventListener('focusout', () => {
        clearTimeout(cleanupTimer);
        cleanupTimer = setTimeout(syncFocus, 0);
    }, true);
    window.addEventListener('pagehide', restore);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) restore();
    });
})();
