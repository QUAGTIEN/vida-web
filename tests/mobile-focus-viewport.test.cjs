const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/js/ui/mobile-focus-viewport.js'), 'utf8');
const original = 'width=device-width, initial-scale=1.0, viewport-fit=cover';

function harness({ userAgent = 'iPhone', platform = 'iPhone', maxTouchPoints = 5,
    scale = 1, content = original, hasViewport = true } = {}) {
    const listeners = new Map();
    const timers = new Map();
    let timerId = 0;
    class Element {
        constructor(tagName = 'INPUT', type = 'text') {
            this.tagName = tagName;
            this.type = type;
        }
        closest(selector) {
            if (selector === 'label') return this.label || null;
            return this.field || (['INPUT', 'TEXTAREA', 'SELECT'].includes(this.tagName) ? this : null);
        }
    }
    const meta = {
        content,
        getAttribute: () => meta.content,
        setAttribute: (_name, value) => { meta.content = value; }
    };
    const addEventListener = (name, fn) => {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(fn);
    };
    const document = {
        activeElement: null, hidden: false, addEventListener,
        querySelector: () => hasViewport ? meta : null
    };
    const window = { visualViewport: { scale }, addEventListener };
    vm.runInNewContext(source, {
        navigator: { userAgent, platform, maxTouchPoints }, document, window, Element,
        setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
        clearTimeout: id => timers.delete(id)
    });
    return {
        meta, document, window, Element, listeners, timers,
        emit(name, event = {}) {
            for (const fn of listeners.get(name) || []) fn({ type: name, isPrimary: true, ...event });
        },
        flush() {
            const pending = [...timers.values()];
            timers.clear();
            pending.forEach(fn => fn());
        }
    };
}

test('does not restrict the viewport at startup or install on non-iOS', () => {
    assert.equal(harness().meta.content, original);
    for (const config of [
        { userAgent: 'Android Chrome', platform: 'Linux' },
        { userAgent: 'Macintosh Safari', platform: 'MacIntel', maxTouchPoints: 0 },
        { hasViewport: false }
    ]) assert.equal(harness(config).listeners.size, 0);
});

test('arms before native focus without touching the field, including label taps', () => {
    const h = harness();
    const input = new h.Element();
    input.value = 'Nhận xét chưa lưu';
    const labelChild = new h.Element('SPAN');
    labelChild.label = { control: input };
    h.emit('pointerdown', { target: labelChild });
    assert.equal(h.meta.content, original + ',maximum-scale=1');
    h.document.activeElement = input;
    h.emit('focusin');
    h.flush();
    assert.equal(input.value, 'Nhận xét chưa lưu');
    assert.deepEqual(Object.keys(input), ['tagName', 'type', 'value']);
    h.document.activeElement = null;
    h.emit('focusout');
    h.flush();
    assert.equal(h.meta.content, original);
});

test('covers dynamically focused text, select, date, password and editable controls', () => {
    for (const [tag, type] of [['INPUT', 'text'], ['INPUT', 'password'], ['INPUT', 'date'],
        ['TEXTAREA', ''], ['SELECT', ''], ['DIV', '']]) {
        const h = harness();
        const input = new h.Element(tag, type);
        if (tag === 'DIV') input.field = input;
        h.document.activeElement = input;
        h.emit('focusin');
        assert.match(h.meta.content, /maximum-scale=1$/);
    }
});

test('touchstart fallback and canceled tap restore the original viewport', () => {
    const h = harness();
    h.emit('touchstart', { target: new h.Element(), touches: [{}] });
    assert.notEqual(h.meta.content, original);
    h.flush();
    assert.equal(h.meta.content, original);
});

test('switching fields and repeated taps never accumulate scale directives', () => {
    const h = harness();
    for (let i = 0; i < 8; i++) {
        h.emit('focusout');
        h.document.activeElement = new h.Element();
        h.emit('pointerdown', { target: h.document.activeElement });
        h.emit('touchstart', { target: h.document.activeElement, touches: [{}] });
        h.emit('focusin');
        h.flush();
        assert.equal(h.meta.content, original + ',maximum-scale=1');
    }
});

test('pinch immediately restores zoom and does not rearm during the gesture', () => {
    const h = harness();
    h.document.activeElement = new h.Element();
    h.emit('focusin');
    h.emit('touchstart', { touches: [{}, {}] });
    assert.equal(h.meta.content, original);
    h.emit('focusin');
    h.flush();
    assert.equal(h.meta.content, original);
    h.emit('touchend', { touches: [] });
    h.window.visualViewport.scale = 2;
    h.emit('pointerdown', { target: h.document.activeElement });
    assert.equal(h.meta.content, original + ',maximum-scale=2');
    h.emit('gesturestart');
    assert.equal(h.meta.content, original);
    h.emit('gestureend');
});

test('cleanup covers blur, touch cancel, leaving the page and backgrounding', () => {
    for (const event of ['touchcancel', 'pagehide', 'visibilitychange']) {
        const h = harness();
        h.emit('pointerdown', { target: new h.Element() });
        h.document.hidden = true;
        h.emit(event);
        assert.equal(h.meta.content, original);
        assert.equal(h.timers.size, 0);
    }
});

test('does not affect buttons, non-text inputs, disabled or readonly fields', () => {
    const h = harness();
    const readonly = new h.Element();
    readonly.readOnly = true;
    const disabled = new h.Element();
    disabled.disabled = true;
    for (const el of [null, new h.Element('BUTTON'), readonly, disabled,
        ...['button', 'submit', 'reset', 'image', 'hidden', 'checkbox', 'radio', 'file', 'range', 'color']
            .map(type => new h.Element('INPUT', type))]) {
        h.emit('pointerdown', { target: el });
        assert.equal(h.meta.content, original);
    }
});

test('iPad desktop UA works and existing viewport/intentional zoom are preserved', () => {
    const content = original + ', maximum-scale=5';
    const h = harness({ userAgent: 'Macintosh Safari', platform: 'MacIntel', content, scale: 1.5 });
    h.document.activeElement = new h.Element();
    h.emit('focusin');
    assert.equal(h.meta.content, original + ',maximum-scale=1.5');
    h.document.activeElement = null;
    h.emit('focusout');
    h.flush();
    assert.equal(h.meta.content, content);
});

test('cleanup does not clobber a viewport change made by another owner', () => {
    const h = harness();
    h.document.activeElement = new h.Element();
    h.emit('focusin');
    h.meta.content = original + ', interactive-widget=resizes-content';
    h.emit('pagehide');
    assert.equal(h.meta.content, original + ', interactive-widget=resizes-content');
});
