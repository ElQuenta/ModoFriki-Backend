import { RequestHandler, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import AppError from '../utils/AppError';
import { ErrorResponseHandler } from '../handlers/error.handler';

export function validateQuery(schema: Joi.ObjectSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      convert: true,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => d.message).join(', ');
      ErrorResponseHandler(
        res,
        new AppError(`Validation error: ${details}`, 400),
      );
      return;
    }

    req.params = value;
    next();
  };
}