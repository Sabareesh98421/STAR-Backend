import type { HTTPResponse } from "@/shared/types";
import { getStatusText } from "./httpsresponse.errorcode";
export default function response<T>(res:HTTPResponse<T>){
    const body=res.body
    return new Response(JSON.stringify(body),{
        status:res.status,
        statusText:getStatusText(res.status)
    });
}