import Elysia from "elysia";
import { emailRouter } from "../providers/email";
const routerConfig={
    prefix:'/auth'
}
const authRoutes = new Elysia(routerConfig).use(emailRouter)

export default authRoutes;