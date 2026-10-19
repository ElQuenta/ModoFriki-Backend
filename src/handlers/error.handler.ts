import type { Response } from "express";
import AppError from "../utils/AppError";

export interface ErrorResponse {
	success: false;
	code: number;
	error: { message: string };
}

export function GetErrorCode(err: unknown): { statusCode: number; message: string } {
	if (err instanceof AppError) {
		return { statusCode: err.statusCode, message: err.message };
	}

	return { statusCode: 500, message: "Internal Server Error" };
}

export function ErrorResponseHandler(res: Response<ErrorResponse>, err: unknown): void {
	const { statusCode, message } = GetErrorCode(err);

	res.status(statusCode).json({
		success: false,
		code: statusCode,
		error: { message }
	});
}
