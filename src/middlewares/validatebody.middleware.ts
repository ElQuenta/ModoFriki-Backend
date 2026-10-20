import { RequestHandler, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import AppError from '../utils/AppError';
import { ErrorResponseHandler } from '../handlers/error.handler';

export function validateBody(schema: Joi.ObjectSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, convert: true });

    if (error) {
      const details = error.details.map((d) => d.message).join(', ');
      ErrorResponseHandler(
        res,
        new AppError(`Validation error: ${details}`, 400),
      );
      return;
    }

    req.body = value;
    next();
  };
}