import type { Response } from "express";


export function NoContentResponseHandler(res: Response): void {
	res.status(204).send();
}

export function CreatedResponseHandler<T>(res: Response, data: T): void {
	res.status(201).json({ success: true, code: 201, data });
}

export function SuccessResponseHandler<T>(res: Response, data: T): void {
	res.status(200).json({ success: true, code: 200, data });
}
