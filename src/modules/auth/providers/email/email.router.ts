import Elysia from "elysia";
import signup from "./email.handler";
import { emailSignupSchema } from './email.schema';
const routerConfig={
    prefix:"/email"
}
const emailRouter = new Elysia(routerConfig)
.post('/signup',signup,{body:emailSignupSchema})
.post('/signin',()=>{})
.post('/signout',()=>{})

export default emailRouter;