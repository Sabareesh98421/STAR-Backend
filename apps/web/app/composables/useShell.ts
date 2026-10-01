import { onBeforeUnmount, onMounted, readonly, ref, shallowRef } from 'vue';
import { dismissTopmost as peelLayer } from '../domain/workspace';
import type { ShellLayer, SpotlightPrefix } from '../domain/workspace';

/**
 * Shell state: which layer owns the FIELD, whether focus mode is on, and the
 * hint layer.
 *
 * Sheet C's keymap runs on one listener rather than Nuxt UI's
 * defineShortcuts: that never fired here, and this is 20 lines that do. The
 * hint layer shares the listener, since it is a hold gesture rather than a
 * shortcut and needs the same keydown/keyup pair.
 */
export function useShell() {
    const layer = shallowRef<ShellLayer>('rest');
    const focusMode = ref(false);
    const goLive = ref(false);
    const hintHeld = ref(false);
    const spotlightPrefix = shallowRef<SpotlightPrefix | null>(null);
    const toast = shallowRef<string | null>(null);

    let hintTimer: ReturnType<typeof setTimeout> | null = null;
    let toastTimer: ReturnType<typeof setTimeout> | null = null;

    function openSpotlight(prefix: SpotlightPrefix | null) {
        spotlightPrefix.value = prefix;
        layer.value = 'spotlight';
    }

    function showToast(message: string) {
        toast.value = message;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (toast.value = null), 2400);
    }

    function dismiss() {
        const next = peelLayer({
            layer: layer.value,
            hasToast: toast.value !== null,
            focusMode: focusMode.value,
        });
        layer.value = next.layer;
        if (!next.hasToast) toast.value = null;
        focusMode.value = next.focusMode;
    }

    /**
     * Identifies a letter key from either channel.
     *
     * `code` is the stable one on real hardware, and the only one that
     * survives Alt composing a different character on some layouts. But it is
     * absent on synthesised events, which report `key` alone. Accepting either
     * covers both without preferring one wrongly.
     */
    function isLetter(event: KeyboardEvent, letter: string): boolean {
        return event.code === `Key${letter}` || event.key.toLowerCase() === letter.toLowerCase();
    }

    /** Sheet C's keymap, on one listener. */
    function runShortcut(event: KeyboardEvent): boolean {
        const { ctrlKey, metaKey, altKey, shiftKey, key } = event;

        if (key === 'Escape') return dismiss(), true;
        if (ctrlKey && shiftKey && isLetter(event, 'P')) return openSpotlight('cmd'), true;
        if (ctrlKey && shiftKey && isLetter(event, 'E')) return openSpotlight('fs'), true;
        if (ctrlKey && !shiftKey && isLetter(event, 'P')) return openSpotlight(null), true;
        if (altKey && shiftKey && isLetter(event, 'F')) return (focusMode.value = !focusMode.value), true;
        if (altKey && !shiftKey && isLetter(event, 'L')) return (layer.value = 'rest'), true;
        if (altKey && !shiftKey && isLetter(event, 'R') && goLive.value) return (layer.value = 'console'), true;
        if (metaKey && isLetter(event, 'S')) return showToast('Saved Cache.ts'), true;
        return false;
    }

    function clearHint() {
        if (hintTimer) {
            clearTimeout(hintTimer);
            hintTimer = null;
        }
        hintHeld.value = false;
    }

    function onKeyDown(event: KeyboardEvent) {
        // Sheet A: held 400ms. repeat guards the OS key-repeat storm.
        if (event.key === 'Alt' && !event.repeat && hintTimer === null) {
            hintTimer = setTimeout(() => (hintHeld.value = true), 400);
        }

        if (runShortcut(event)) event.preventDefault();
    }

    function onKeyUp(event: KeyboardEvent) {
        if (event.key === 'Alt') clearHint();
    }

    onMounted(() => {
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        // Alt-Tabbing away never delivers the keyup, which would strand the
        // hint layer on until the next Alt press.
        window.addEventListener('blur', clearHint);
    });

    onBeforeUnmount(() => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', clearHint);
        clearHint();
        if (toastTimer) clearTimeout(toastTimer);
    });

    return {
        layer: readonly(layer),
        focusMode,
        goLive,
        hintHeld: readonly(hintHeld),
        spotlightPrefix: readonly(spotlightPrefix),
        toast: readonly(toast),
        showToast,
        rest: () => (layer.value = 'rest'),
        runConsole: () => (layer.value = 'console'),
    };
}
