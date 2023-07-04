import { HttpStatusCode } from "axios";
import { Request as JWTRequest } from "express-jwt";
import type { Response, NextFunction } from "express";

import { guardMiddleware } from "./guard";
import { JwtPayload } from "./auth";
import { ServerError } from "./error";

describe("Test Guard Middleware", () => {
  let mockRequest: Partial<JWTRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      auth: {
        walletAddress: "",
        permissions: [],
        refreshable: false,
      },
    };
    mockResponse = {
      json: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  const PermissionError = new ServerError(
    HttpStatusCode.Forbidden,
    "Permission denied"
  );

  test("empty permissions", async () => {
    (mockRequest.auth as JwtPayload).permissions = [];

    const middleware = guardMiddleware("attendee");
    middleware(
      mockRequest as JWTRequest,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toBeCalledTimes(1);
    expect(nextFunction).toBeCalledWith(PermissionError);
  });

  test("required string sufficient", async () => {
    (mockRequest.auth as JwtPayload).permissions = ["attendee"];

    const middleware = guardMiddleware("attendee");
    middleware(
      mockRequest as JWTRequest,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toBeCalledTimes(1);
    expect(nextFunction).toBeCalledWith(null);
  });

  test("required string insufficient", async () => {
    (mockRequest.auth as JwtPayload).permissions = ["attendee"];

    const middleware = guardMiddleware("organizer");
    middleware(
      mockRequest as JWTRequest,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toBeCalledTimes(1);
    expect(nextFunction).toBeCalledWith(PermissionError);
  });

  test("required array", async () => {
    (mockRequest.auth as JwtPayload).permissions = ["attendee"];

    const middleware = guardMiddleware(["attendee"]);
    middleware(
      mockRequest as JWTRequest,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toBeCalledTimes(1);
    expect(nextFunction).toBeCalledWith(null);
  });

  test("required array sufficient", async () => {
    (mockRequest.auth as JwtPayload).permissions = [
      "attendee",
      "organizer",
      "admin",
    ];

    const middleware = guardMiddleware(["attendee", "organizer"]);
    middleware(
      mockRequest as JWTRequest,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toBeCalledTimes(1);
    expect(nextFunction).toBeCalledWith(null);
  });

  test("required array insufficient", async () => {
    (mockRequest.auth as JwtPayload).permissions = ["attendee"];

    const middleware = guardMiddleware(["attendee", "organizer"]);
    middleware(
      mockRequest as JWTRequest,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toBeCalledTimes(1);
    expect(nextFunction).toBeCalledWith(PermissionError);
  });
});
