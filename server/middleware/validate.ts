import { NextFunction, Request, Response } from "express";
import { ZodError, ZodSchema } from "zod";

type RequestTarget = "body" | "query" | "params";

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function validate(target: RequestTarget, schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: formatZodError(result.error),
      });
    }

    req[target] = result.data;
    return next();
  };
}

export const validateBody = (schema: ZodSchema) => validate("body", schema);
export const validateQuery = (schema: ZodSchema) => validate("query", schema);
export const validateParams = (schema: ZodSchema) => validate("params", schema);
