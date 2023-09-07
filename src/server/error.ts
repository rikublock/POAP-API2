import { HttpStatusCode } from "axios";
import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "express-jwt";

import { AttendifyError } from "../attendify/error";

export class ServerError extends Error {
  public status: HttpStatusCode;
  public message: string;
  public data?: Record<string, any>;

  constructor(
    status: HttpStatusCode,
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
  console.debug(err.name, req.path, `"${err.message}"`, (err as any).data);
  console.debug("body:", req.body, "query:", req.query);
  
  if (err instanceof AttendifyError) {
    res
      .status(HttpStatusCode.BadRequest)
      .json({ result: null, error: err.message });
  } else if (err instanceof ServerError) {
    res
      .status(err.status)
      .json({ result: null, error: err.message, details: err.data });
  } else if (err instanceof UnauthorizedError) {
    res
      .status(HttpStatusCode.Unauthorized)
      .json({ result: null, error: err.inner.message });
  } else {
    console.error(err); // for full stack trace
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ result: null, error: null });
  }
}
