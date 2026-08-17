import Elysia from "elysia";
import signupHandler from "@/modules/auth/service/email.signup";
import { emailSignupSchema } from './email.schema';
const routerConfig={
    prefix:"/email"
}
const emailRouter = new Elysia(routerConfig)
.post('/signup',({body})=>signupHandler(body),{body:emailSignupSchema})
.post('/signin',()=>{})
.post('/signout',()=>{})

export default emailRouter;