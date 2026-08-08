
import response from '@/shared/http/response';
import { success,failure } from '@/shared/http/responseHelper';
import type { EmailSignupRequest } from '../providers/email/email.schema';
export default function signupService(body:EmailSignupRequest) {
//INFO: Move this logic into server.ts : by Author: Padmanabhan.S
    // if(!body) {
    //     return response(
    //         failure(new ValidationError('Request Body is Required'))
    //     );
    // }
    const _user:EmailSignupRequest = body;
    // oho...Ihaven't setup the Redis 😅  
    return response(success<null>(null,'User signed up successfully',201));
}
