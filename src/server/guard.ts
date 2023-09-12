import { HttpStatusCode } from "axios";
import type { Response, NextFunction } from "express";
import { Request as JWTRequest } from "express-jwt";

import { JwtPayload, Permission } from "./auth";
import { ServerError } from "./error";

function isNested(x: Permission[] | Permission[][]): x is Permission[][] {
  return (x as Permission[][]).every((x) => Array.isArray(x));
}

/**
 * Middleware to checks jwt permissions
 *
 * single permission: "admin"
 * requires: "admin"
 *
 * array of permissions: ["organizer", "admin"]
 * requires: "organizer" AND "admin"
 *
 * array of arrays of permissions: [["organizer"], ["admin"]]
 * requires: "organizer" OR "admin"
 *
 * @param required - scope permission requirements
 */
export function guardMiddleware(
  required: Permission | Permission[] | Permission[][]
) {
  return async (
    req: JWTRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const permissions = (req.auth as JwtPayload)?.permissions;

    if (Array.isArray(required)) {
      if (!isNested(required)) {
        required = [required];
      }
    } else {
      required = [[required]];
    }

    const sufficient = required.some((x) => {
      return x.every((permission) => {
        return permissions.includes(permission);
      });
    });

    return next(
      !sufficient
        ? new ServerError(HttpStatusCode.Forbidden, "Permission denied")
        : null
    );
  };
}
