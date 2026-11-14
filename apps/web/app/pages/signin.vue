<script setup lang="ts">
import { ref } from 'vue';
import { signIn } from '../transport/auth.transport';

useHead({ title: 'Sign in — Ensemblem' });

const apiBase = useRuntimeConfig().public.apiBase;
const email = ref('');
const password = ref('');
const loading = ref(false);
const serverError = ref<string | null>(null);

async function submit() {
    loading.value = true;
    serverError.value = null;
    try {
        await signIn(apiBase, email.value.trim(), password.value);
        await navigateTo('/');
    } catch (error) {
        serverError.value = error instanceof Error ? error.message : 'Sign in failed. Try again.';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <UApp>
        <main class="flex min-h-dvh items-center justify-center overflow-y-auto bg-bg px-4 py-8">
            <GlassPanel class="w-full max-w-sm space-y-7 p-8">
                <div class="space-y-1">
                    <p class="text-ink-85 text-16 font-medium">Sign in</p>
                    <p class="text-ink-45 text-12">
                        Need an account?
                        <NuxtLink to="/signup" class="text-accent underline-offset-2 hover:underline">
                            Sign up
                        </NuxtLink>
                    </p>
                </div>

                <form class="space-y-5" @submit.prevent="submit">
                    <UFormField label="Email" required class="w-full">
                        <UInput
                            v-model="email"
                            name="email"
                            type="email"
                            autocomplete="email"
                            required
                            class="w-full"
                            :ui="{ base: 'w-full' }"
                        />
                    </UFormField>

                    <UFormField label="Password" required class="w-full">
                        <UInput
                            v-model="password"
                            name="password"
                            type="password"
                            autocomplete="current-password"
                            required
                            class="w-full"
                            :ui="{ base: 'w-full' }"
                        />
                    </UFormField>

                    <p v-if="serverError" role="alert" class="text-12 text-red-500">
                        {{ serverError }}
                    </p>

                    <UButton
                        type="submit"
                        variant="solid"
                        color="primary"
                        class="w-full justify-center text-center disabled:cursor-not-allowed disabled:opacity-45"
                        :loading="loading"
                        :disabled="loading || !email || !password"
                        label="Sign in"
                    />
                </form>
            </GlassPanel>
        </main>
    </UApp>
</template>