
import response from '@/shared/http/response';
import { success } from '@/shared/http/responseHelper';
import type { EmailSignupRequest } from '../providers/email/email.schema';
import { db } from '@/infrastructure/sqlLite/sqlLite.client';
import { AppError } from '@/shared/errors';
import appErrorCodes from '@/shared/errors/app.error.codes';
export default function signupService(body:EmailSignupRequest) {
//INFO: Move this logic into server.ts : by Author: Padmanabhan.S
    // if(!body) {
    //     return response(
    //         failure(new ValidationError('Request Body is Required'))
    //     );
    // }
    const user:EmailSignupRequest = body;

    // oho...Ihaven't setup the Sqlite😅
    
    try{

        const sqlLite =  db.connectDb();
        if(!sqlLite) {
            throw new AppError("Db connection failed",appErrorCodes.dbStartError.toString(),500);
        }
        sqlLite?.set(user)
        return response(success<null>(null,'User signed up successfully',201));
    }
    catch(err:unknown){

    }
}
