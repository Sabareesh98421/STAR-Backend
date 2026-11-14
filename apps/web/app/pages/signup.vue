<script setup lang="ts">
import { ref, computed } from 'vue';
import { requestEmailVerification } from '../transport/auth.transport';

useHead({ title: 'Sign up — Ensemblem' });

const apiBase = useRuntimeConfig().public.apiBase;

// Form state
const firstName = ref('');
const secondName = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const showConfirm = ref(false);

// Submission state
const loading = ref(false);
const serverError = ref<string | null>(null);
const done = ref(false);
const step = ref(1);

// Client-side password rules — mirrors the API's passwordSchema so the user
// sees feedback before the round trip, not after.
const rules = computed(() => [
    { label: 'At least 8 characters', pass: password.value.length >= 8 },
    { label: 'One lowercase letter', pass: /[a-z]/.test(password.value) },
    { label: 'One uppercase letter', pass: /[A-Z]/.test(password.value) },
    { label: 'One number', pass: /\d/.test(password.value) },
    { label: 'One special character', pass: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password.value) },
]);

const passwordsMatch = computed(
    () => confirmPassword.value.length === 0 || password.value === confirmPassword.value
);

const allRulesPass = computed(() => rules.value.every((r) => r.pass));

const canSubmit = computed(
    () =>
        firstName.value.trim().length > 0 &&
        email.value.length > 0 &&
        allRulesPass.value &&
        password.value === confirmPassword.value &&
        !loading.value
);

const canContinue = computed(() => firstName.value.trim().length > 0 && email.value.trim().length > 0);

async function continueSignup() {
    serverError.value = null;
    if (step.value === 1) {
        step.value = 2;
        return;
    }
    await submit();
}

async function submit() {
    if (!canSubmit.value) return;
    loading.value = true;
    serverError.value = null;
    try {
        const res = await fetch(`${apiBase}/auth/email/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firstName: firstName.value.trim(),
                secondName: secondName.value.trim() || null,
                email: email.value.trim(),
                password: password.value,
                confirmPassword: confirmPassword.value,
            }),
        });
        const body = await res.json();
        if (!res.ok) {
            serverError.value = body?.error?.message ?? 'Something went wrong, please try again.';
            return;
        }
        try {
            await requestEmailVerification(apiBase, email.value.trim());
        } catch (reason) {
            serverError.value = reason instanceof Error
                ? `Account created, but the verification code could not be sent: ${reason.message}`
                : 'Account created, but the verification code could not be sent. Continue to verification to retry.';
        }
        done.value = true;
    } catch {
        serverError.value = 'Could not reach the server. Check your connection and try again.';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <UApp>
        <main class="flex min-h-dvh items-center justify-center overflow-y-auto bg-bg px-4 py-8">

            <!-- Success state -->
            <GlassPanel v-if="done" class="w-full max-w-sm space-y-3 p-8 text-center">
                <p class="text-ink-85 font-medium">Check your email</p>
                <p class="text-ink-45 text-13">
                    A verification code was sent to
                    <span class="text-ink-75">{{ email }}</span>.
                </p>
                <p v-if="serverError" role="alert" class="text-12 text-red-500">
                    {{ serverError }}
                </p>
                <UButton
                    :to="{ path: '/verify', query: { email } }"
                    variant="solid"
                    color="primary"
                    class="mt-2 w-full justify-center text-center"
                    label="Continue to verification"
                />
            </GlassPanel>

            <!-- Form -->
            <GlassPanel v-else class="w-full max-w-sm space-y-6 p-8">

                <div class="space-y-1">
                    <p class="text-ink-85 font-medium text-16">Create your account</p>
                    <p class="text-ink-45 text-12">
                        Already have one?
                        <NuxtLink to="/signin" class="text-accent underline-offset-2 hover:underline">
                            Sign in
                        </NuxtLink>
                    </p>
                </div>

                <ol aria-label="Signup progress" class="flex items-center gap-2 text-12 text-ink-40">
                    <li :aria-current="step === 1 ? 'step' : undefined" :class="step === 1 ? 'text-ink-85' : ''">
                        1. Details
                    </li>
                    <li aria-hidden="true">/</li>
                    <li :aria-current="step === 2 ? 'step' : undefined" :class="step === 2 ? 'text-ink-85' : ''">
                        2. Password
                    </li>
                </ol>

                <form class="space-y-4" @submit.prevent="continueSignup">

                    <template v-if="step === 1">
                        <UFormField label="Name" required class="w-full">
                            <UInput
                                v-model="firstName"
                                name="firstName"
                                placeholder="Your name"
                                autocomplete="given-name"
                                required
                                class="w-full"
                                :ui="{ base: 'w-full' }"
                            />
                        </UFormField>
                        <UFormField label="Second name" class="w-full">
                            <UInput
                                v-model="secondName"
                                name="secondName"
                                placeholder="Optional"
                                autocomplete="additional-name"
                                class="w-full"
                                :ui="{ base: 'w-full' }"
                            />
                        </UFormField>
                        <UFormField label="Email" required class="w-full">
                            <UInput
                                v-model="email"
                                name="email"
                                type="email"
                                placeholder="you@example.com"
                                autocomplete="email"
                                required
                                class="w-full"
                                :ui="{ base: 'w-full' }"
                            />
                        </UFormField>
                    </template>

                    <!-- Password -->
                    <UFormField v-else label="Password" required class="w-full">
                        <UInput
                            v-model="password"
                            name="password"
                            :type="showPassword ? 'text' : 'password'"
                            placeholder="Password"
                            autocomplete="new-password"
                            class="w-full"
                            :ui="{ base: 'w-full' }"
                        >
                            <template #trailing>
                                <button
                                    type="button"
                                    class="text-ink-40 hover:text-ink-75 transition-colors"
                                    :aria-label="showPassword ? 'Hide password' : 'Show password'"
                                    @click="showPassword = !showPassword"
                                >
                                    <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
                                </button>
                            </template>
                        </UInput>

                        <!-- Password strength checklist — visible once the user starts typing -->
                        <ul
                            v-if="password.length > 0"
                            class="mt-2 space-y-1"
                            aria-label="Password requirements"
                        >
                            <li
                                v-for="rule in rules"
                                :key="rule.label"
                                class="flex items-center gap-2 text-12 transition-colors"
                                :class="rule.pass ? 'text-ink-75' : 'text-ink-40'"
                            >
                                <UIcon
                                    :name="rule.pass ? 'i-lucide-check' : 'i-lucide-circle'"
                                    class="shrink-0"
                                    :class="rule.pass ? 'text-accent' : ''"
                                />
                                {{ rule.label }}
                            </li>
                        </ul>
                    </UFormField>

                    <!-- Confirm password -->
                    <UFormField
                        v-if="step === 2"
                        label="Confirm password"
                        required
                        class="w-full"
                        :error="!passwordsMatch ? 'Passwords do not match' : undefined"
                    >
                        <UInput
                            v-model="confirmPassword"
                            name="confirmPassword"
                            :type="showConfirm ? 'text' : 'password'"
                            placeholder="Repeat password"
                            autocomplete="new-password"
                            class="w-full"
                            :ui="{ base: 'w-full' }"
                            :color="!passwordsMatch ? 'error' : undefined"
                        >
                            <template #trailing>
                                <button
                                    type="button"
                                    class="text-ink-40 hover:text-ink-75 transition-colors"
                                    :aria-label="showConfirm ? 'Hide password' : 'Show password'"
                                    @click="showConfirm = !showConfirm"
                                >
                                    <UIcon :name="showConfirm ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
                                </button>
                            </template>
                        </UInput>
                    </UFormField>

                    <!-- Server error -->
                    <p v-if="serverError" role="alert" class="text-12 text-red-500">
                        {{ serverError }}
                    </p>

                    <div class="flex gap-3">
                        <UButton
                            v-if="step === 2"
                            type="button"
                            variant="outline"
                            color="neutral"
                            class="flex-1 justify-center"
                            :disabled="loading"
                            label="Previous"
                            @click="step = 1"
                        />
                        <UButton
                            type="submit"
                            variant="solid"
                            color="primary"
                            class="flex-1 justify-center text-center disabled:cursor-not-allowed disabled:opacity-45"
                            :loading="loading"
                            :disabled="step === 1 ? !canContinue : !canSubmit"
                            :label="step === 1 ? 'Next' : 'Create account'"
                        />
                    </div>
                </form>
            </GlassPanel>
        </main>
    </UApp>
</template>
