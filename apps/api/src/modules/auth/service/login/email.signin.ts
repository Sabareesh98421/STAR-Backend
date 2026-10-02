//email.signin.ts
import { userRepository, type UserRecord, } from '@/infrastructure/database';
import {AppError, NotFoundError } from '@/shared/errors';
import { response, failure, success, toResponse } from '@/shared/http';
import { TryCatch } from '@/shared/utils/try-catch';
import type { EmailSigninRequest } from '@/modules/auth/providers/email';
import { verifyPassword } from '@/modules/auth/service/password';

export default async function signInHandler(user:EmailSigninRequest){

    return TryCatch.of(()=>signin(user)).onError(toResponse);

}
async function signin (user:EmailSigninRequest){
    const userFound:UserRecord|null= await userRepository.findByEmail(user.email);
    // This is delibrate wither way the client can' distingues between user not found and the creds mismatch due the zod-gatekeeping.
    // so this response is fine for now and attacker can be read this, that's fine this guard and split is required for the developer also.
    if(null === userFound){
        return response(failure(new NotFoundError("User Not Found",user.email)))
    }
    if(!await verifyPassword(user.password,userFound.passwordHash)){
        return response(failure(new AppError("email or password is incorrect","creds mismatch",409)));
    }
    // Now we are sure that the user is exist and have the valid password so let the kind person in.
    return response(success())
}

