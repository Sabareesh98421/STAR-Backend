import { getCurrentUser } from '../transport/auth.transport';

export default defineNuxtRouteMiddleware(async () => {
    const { apiBase } = useRuntimeConfig().public;
    const user = await getCurrentUser(apiBase);
    if (user) return;
    return navigateTo('/signin', { replace: true });
});