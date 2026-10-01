import Elysia from "elysia";
import { emailRouter } from "../providers/email";
import { otpRouter } from "../providers/OTP";
const routerConfig={
    prefix:'/auth'
}
const authRoutes = new Elysia(routerConfig).use(emailRouter).use(otpRouter)

export default authRoutes;