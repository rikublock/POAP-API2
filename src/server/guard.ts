import type { Response, NextFunction } from "express";
import { Request as JWTRequest } from "express-jwt";
import { StatusCodes } from "http-status-codes";

import { JwtPayload, Permission } from "./auth";
import { ServerError } from "./error";

export function guardMiddleware(required: Permission | Permission[]) {
  return async (
    req: JWTRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const permissions = (req.auth as JwtPayload)?.permissions;

    if (!Array.isArray(required)) {
      required = [required];
    }

    const sufficient = required.every((permission) =>
      permissions.includes(permission)
    );

    return next(
      !sufficient
        ? new ServerError(StatusCodes.FORBIDDEN, "Permission denied")
        : null
    );
  };
}
