import Elysia from "elysia";
import {signupHandler,signInHandler} from "@/modules/auth/service";
import { emailSigninSchema, emailSignupSchema } from './email.schema';
const routerConfig={
    prefix:"/email"
}
const emailRouter = new Elysia(routerConfig)
.post('/signup',({body})=>signupHandler(body),{body:emailSignupSchema})
.post('/signin',({body})=>signInHandler(body),{body:emailSigninSchema})
.post('/signout',()=>{})

export default emailRouter;