import { onBeforeUnmount, reactive, ref, toRefs } from 'vue';
import { applyEvent, emptyRunState, type LinkState } from '../domain/run';
import { makeHttpRunTransport, type RunTransport } from '../transport/run.transport';

/**
 * Holds one run.
 *
 * State is plainly reactive rather than shallow. It is bounded by the agent
 * count and carries no token text, so there is nothing here worth the identity
 * bugs that shallowRef plus triggerRef invites. The place that genuinely needs
 * shallow state is streaming response text, which is kept out of this store.
 */
export function useRun(transport?: RunTransport) {
    // Built here rather than as a module-level default: the API base comes from
    // runtime config, which only exists inside a Nuxt setup context. A spec
    // passes its own transport and never touches this.
    const wire = transport ?? makeHttpRunTransport(useRuntimeConfig().public.apiBase);
    const state = reactive(emptyRunState());
    /** Our connection, not the run. A drop moves this and nothing else. */
    const link = ref<LinkState>('live');

    let controller: AbortController | null = null;

    function cancel() {
        controller?.abort(new DOMException('cancelled', 'AbortError'));
        controller = null;
    }

    async function start(prompt: string) {
        cancel();
        Object.assign(state, emptyRunState());
        state.status = 'responding';

        controller = new AbortController();
        const { signal } = controller;

        try {
            for await (const event of wire.start(prompt, signal)) {
                if (signal.aborted) return;
                applyEvent(state, event);
            }
            link.value = 'live';
        } catch (error) {
            // An abort is a cancellation. Anything else is the transport
            // dropping, which moves the link and leaves the run's own status
            // alone until the backend says otherwise.
            if ((error as Error)?.name === 'AbortError') state.status = 'cancelled';
            else link.value = 'offline';
        }
    }

    // Leaving must not leave a run streaming into a dead component.
    onBeforeUnmount(cancel);

    return { ...toRefs(state), link, start, cancel };
}
