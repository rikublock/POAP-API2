import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "express-jwt";
import { StatusCodes } from "http-status-codes";

import { AttendifyError } from "../attendify/error";

export class ServerError extends Error {
  public status: StatusCodes;
  public message: string;
  public data?: Record<string, any>;

  constructor(
    status: StatusCodes,
    message: string,
    data?: Record<string, any>
  ) {
    super();
    this.name = new.target.name;
    this.status = status;
    this.message = message;
    this.data = data;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(err.name, req.path, `"${err.message}"`, (err as any).data);
  console.error("body:", req.body, "query:", req.query);
  if (err instanceof AttendifyError) {
    res
      .status(StatusCodes.BAD_REQUEST)
      .json({ result: null, error: err.message });
  } else if (err instanceof ServerError) {
    res
      .status(err.status)
      .json({ result: null, error: err.message, details: err.data });
  } else if (err instanceof UnauthorizedError) {
    res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ result: null, error: err.inner.message });
  } else {
    console.error(err); // for full stack trace
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ result: null, error: null });
  }
}
