import response from '@/shared/http/response';
import { failure } from '@/shared/http/responseHelper';

export default function signup() {
    return response(
        failure('NOT_IMPLEMENTED', undefined, 'Signup is not implemented', 501),
    );
}
