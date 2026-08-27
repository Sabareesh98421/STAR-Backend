import Elysia from "elysia";
import { emailRouter } from "@/modules/auth/providers/email";
import { otpRouter } from "@/modules/auth/providers/OTP";
const routerConfig={
    prefix:'/auth'
}
const authRoutes = new Elysia(routerConfig).use(emailRouter).use(otpRouter)

export default authRoutes;