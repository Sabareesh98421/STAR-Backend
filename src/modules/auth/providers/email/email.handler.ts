//email.handler.ts
import type { Context } from "elysia"
import type { EmailSignupRequest } from "./email.schema"
import {signupService} from '@/modules/auth/service';
export default  function signup({body}:Context<{body:EmailSignupRequest}>){
    const result = signupService(body);
    const responseBody={
        message:"Hey user!!"
    }
    return responseBody;
}
