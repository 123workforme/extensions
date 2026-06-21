import { PaperbackInterceptor, type Request, type Response } from "@paperback/types";
import { HT_DOMAIN } from "./config";

export class HiveToonsInterceptor extends PaperbackInterceptor {
    override async interceptRequest(request: Request): Promise<Request> {
        request.headers = {
            ...request.headers,
            referer: `${HT_DOMAIN}/`,
            origin: HT_DOMAIN,
            "user-agent": await Application.getDefaultUserAgent(),
        };
        return request;
    }

    override async interceptResponse(
        _request: Request,
        _response: Response,
        data: ArrayBuffer,
    ): Promise<ArrayBuffer> {
        return data;
    }
}
