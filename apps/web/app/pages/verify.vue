<script setup lang="ts">
import { ref } from 'vue';
import { requestEmailVerification, verifyEmail } from '../transport/auth.transport';

useHead({ title: 'Verify email — Ensemblem' });

const apiBase = useRuntimeConfig().public.apiBase;
const route = useRoute();
const email = ref(typeof route.query.email === 'string' ? route.query.email : '');
const otp = ref('');
const sending = ref(false);
const verifying = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const verified = ref(false);

async function sendCode() {
    sending.value = true;
    error.value = null;
    notice.value = null;
    try {
        await requestEmailVerification(apiBase, email.value.trim());
        notice.value = 'Verification code sent. Check your email.';
    } catch (reason) {
        error.value = reason instanceof Error ? reason.message : 'Could not send the verification code.';
    } finally {
        sending.value = false;
    }
}

async function submit() {
    verifying.value = true;
    error.value = null;
    notice.value = null;
    try {
        await verifyEmail(apiBase, email.value.trim(), otp.value.trim());
        verified.value = true;
    } catch (reason) {
        error.value = reason instanceof Error ? reason.message : 'Could not verify this code.';
    } finally {
        verifying.value = false;
    }
}
</script>

<template>
    <UApp>
        <main class="flex min-h-dvh items-center justify-center overflow-y-auto bg-bg px-4 py-8">
            <GlassPanel class="w-full max-w-sm space-y-6 p-8">
                <template v-if="verified">
                    <div class="space-y-1">
                        <p class="text-ink-85 text-16 font-medium">Email verified</p>
                        <p class="text-ink-45 text-12">Your account is ready. Sign in to continue.</p>
                    </div>
                    <UButton
                        to="/signin"
                        variant="solid"
                        color="primary"
                        class="w-full justify-center text-center"
                        label="Go to sign in"
                    />
                </template>

                <template v-else>
                    <div class="space-y-1">
                        <p class="text-ink-85 text-16 font-medium">Verify your email</p>
                        <p class="text-ink-45 text-12">Request a code, then enter it to activate your account.</p>
                    </div>

                    <form class="space-y-4" @submit.prevent="submit">
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

                        <UButton
                            type="button"
                            variant="outline"
                            color="neutral"
                            class="w-full justify-center text-center"
                            :loading="sending"
                            :disabled="sending || !email.trim()"
                            label="Send or resend code"
                            @click="sendCode"
                        />

                        <UFormField label="Verification code" required class="w-full">
                            <UInput
                                v-model="otp"
                                name="otp"
                                inputmode="numeric"
                                autocomplete="one-time-code"
                                required
                                class="w-full"
                                :ui="{ base: 'w-full font-mono' }"
                            />
                        </UFormField>

                        <p v-if="notice" role="status" class="text-12 text-ink-45">{{ notice }}</p>
                        <p v-if="error" role="alert" class="text-12 text-red-500">{{ error }}</p>

                        <UButton
                            type="submit"
                            variant="solid"
                            color="primary"
                            class="w-full justify-center text-center"
                            :loading="verifying"
                            :disabled="verifying || !email.trim() || !otp.trim()"
                            label="Verify email"
                        />
                    </form>
                </template>
            </GlassPanel>
        </main>
    </UApp>
</template>