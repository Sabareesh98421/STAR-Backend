//email.handler.ts
import type { Context } from "elysia"
import type { EmailSignupRequest } from "./email.schema"
import {signupService} from '@/modules/auth/service';
export default async function signup({body}:Context<{body:EmailSignupRequest}>){
    return await signupService(body);
}
