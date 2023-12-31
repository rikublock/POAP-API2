import assert from "node:assert/strict";

import { HttpStatusCode } from "axios";
import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import {
  expressjwt as authMiddleware,
  Request as JWTRequest,
} from "express-jwt";
import cors from "cors";
import { validate } from "class-validator";
import { plainToClass } from "class-transformer";
import NodeCache from "node-cache";

import type { Attendify } from "../attendify/attendify";
import { AttendifyError } from "../attendify/error";
import config from "../config";
import {
  type Metadata,
  NetworkIdentifier,
  type PlatformStats,
  WalletType,
} from "../types";
import {
  JwtPayload,
  Permission,
  generateTempToken,
  generateToken,
  verifyGemToken,
  verifyXummToken,
} from "./auth";
import { ServerError, errorHandler } from "./error";
import { guardMiddleware } from "./guard";
import { hashids } from "./util";
import {
  APIGetAdminStats,
  APIGetEventInfo,
  APIGetEventLink,
  APIGetEventMinter,
  APIGetEventsAll,
  APIGetEventsOwned,
  APIGetOffers,
  APIGetOwnershipVerify,
  APIGetUserInfo,
  APIPostAuthLogin,
  APIPostAuthNonce,
  APIPostEventCancel,
  APIPostEventClaim,
  APIPostEventCreate,
  APIPostEventInvite,
  APIPostEventJoin,
  APIPostPaymentCheck,
  APIPostUserUpdate,
} from "./validate";

export async function setup(AttendifyLib: Attendify): Promise<Express> {
  assert(AttendifyLib.isReady());

  const cache = new NodeCache({ stdTTL: 600 });

  // init server
  const app = express();
  app.use(cors());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  /**
   * Fetch authorized minter information
   * @route GET /event/minter
   * @param networkId - network identifier
   * @returns minter status information
   */
  app.get(
    "/event/minter",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware("organizer"),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(
          APIGetEventMinter,
          {
            ...req.query,
            walletAddress: (req.auth as JwtPayload)?.walletAddress,
          },
          {
            strategy: "exposeAll",
            excludeExtraneousValues: true,
          }
        );
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const [minterAddress, isConfigured] =
          await AttendifyLib.getMinterStatus(
            data.networkId,
            data.walletAddress
          );
        res.json({
          result: {
            walletAddress: minterAddress,
            isConfigured,
          },
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Create a new event
   * @route POST /event/create
   * @param networkId - network identifier
   * @param tokenCount - number of NFT tokens to mint
   * @param imageUrl - image url associated with the event (e.g. banner)
   * @param title - event title
   * @param description - detailed event description
   * @param location - event location
   * @param dateStart - start date
   * @param dateEnd - end date
   * @param isManaged - event signup permissions (if false, anyone can join)
   * @returns event identifier and metadata url
   */
  app.post(
    "/event/create",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware("organizer"),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(
          APIPostEventCreate,
          {
            ...req.body,
            walletAddress: (req.auth as JwtPayload)?.walletAddress,
          },
          {
            strategy: "exposeAll",
            excludeExtraneousValues: true,
          }
        );
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const metadata: Metadata = {
          title: data.title,
          description: data.description,
          location: data.location,
          imageUrl: data.imageUrl,
          tokenCount: data.tokenCount,
          dateStart: data.dateStart,
          dateEnd: data.dateEnd,
        };

        const eventId = await AttendifyLib.createEvent(
          data.networkId,
          data.walletAddress,
          metadata,
          data.isManaged
        );
        res.json({
          result: {
            eventId,
          },
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Cancel an existing event
   * @route POST /event/cancel
   * @param eventId - event identifier
   * @returns true, if the operation was successful
   */
  app.post(
    "/event/cancel",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware([["organizer"], ["admin"]]),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(
          APIPostEventCancel,
          {
            ...req.body,
            walletAddress: (req.auth as JwtPayload)?.walletAddress,
          },
          {
            strategy: "exposeAll",
            excludeExtraneousValues: true,
          }
        );
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        await AttendifyLib.cancelEvent(data.eventId);
        res.json({
          result: true,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Sign up for an event
   * @route POST /event/join
   * @param maskedEventId - masked event identifier
   * @param createOffer - immediately create an NFT sell offer
   * @returns offer json object
   */
  app.post(
    "/event/join",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(
          APIPostEventJoin,
          {
            ...req.body,
            walletAddress: (req.auth as JwtPayload)?.walletAddress,
          },
          {
            strategy: "exposeAll",
            excludeExtraneousValues: true,
          }
        );
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const values = hashids.decode(data.maskedEventId);
        if (values.length != 1) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Invalid masked event ID",
              errors
            )
          );
        }

        const eventId = values[0].valueOf() as number;
        const claim = await AttendifyLib.addParticipant(
          eventId,
          data.walletAddress,
          data.createOffer,
          true
        );
        res.json({
          result: claim,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Claim an NFT offer
   * @route POST /event/claim
   * @param maskedEventId - masked event identifier
   * @returns offer json object
   */
  app.post(
    "/event/claim",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(
          APIPostEventClaim,
          {
            ...req.body,
            walletAddress: (req.auth as JwtPayload)?.walletAddress,
          },
          {
            strategy: "exposeAll",
            excludeExtraneousValues: true,
          }
        );
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const values = hashids.decode(data.maskedEventId);
        if (values.length != 1) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Invalid masked event ID",
              errors
            )
          );
        }

        const eventId = values[0].valueOf() as number;
        const claim = await AttendifyLib.getClaim(data.walletAddress, eventId);
        res.json({
          result: claim,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Add several participants to an event
   * @route POST /event/invite
   * @param eventId - event identifier
   * @param attendeeWalletAddresses - wallet addresses of the participants
   * @returns true, if the operation was successful
   */
  app.post(
    "/event/invite",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware("organizer"),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(
          APIPostEventInvite,
          {
            ...req.body,
            walletAddress: (req.auth as JwtPayload)?.walletAddress,
          },
          {
            strategy: "exposeAll",
            excludeExtraneousValues: true,
          }
        );
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        await AttendifyLib.addParticipants(
          data.eventId,
          data.walletAddress,
          data.attendeeWalletAddresses,
          false
        );
        res.json({
          result: true,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Request details about an event (supports masked ids)
   * @route GET /event/info/:id
   * @returns event json objects
   */
  app.get(
    "/event/info/:id",
    authMiddleware({
      secret: config.server.jwtSecret,
      algorithms: ["HS256"],
      credentialsRequired: false,
    }),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        const isMasked = isNaN(Number(req.params.id));

        // verify request data
        const data = plainToClass(
          APIGetEventInfo,
          {
            id: !isMasked ? req.params.id : undefined,
            maskedEventId: isMasked ? req.params.id : undefined,
            walletAddress: (req.auth as JwtPayload)?.walletAddress,
          },
          {
            strategy: "exposeAll",
            excludeExtraneousValues: true,
          }
        );
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        let eventId: number;
        if (isMasked) {
          const values = hashids.decode(data.maskedEventId!);
          if (values.length != 1) {
            return next(
              new ServerError(
                HttpStatusCode.BadRequest,
                "Invalid masked event ID",
                errors
              )
            );
          }
          eventId = values[0].valueOf() as number;
        } else {
          eventId = data.id!;
        }

        const result = await AttendifyLib.getEvent(
          eventId,
          isMasked,
          data.walletAddress
        );
        res.json({
          result: result,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Request a masked event link
   * @route GET /event/link/:id
   * @returns masked event id
   */
  app.get(
    "/event/link/:id",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware("organizer"),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(
          APIGetEventLink,
          {
            id: req.params.id,
            walletAddress: (req.auth as JwtPayload)?.walletAddress,
          },
          {
            strategy: "exposeAll",
            excludeExtraneousValues: true,
          }
        );
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const event = await AttendifyLib.getEvent(
          data.id,
          false,
          data.walletAddress
        );
        if (!event) {
          return next(new AttendifyError("Invalid event ID"));
        }
        if (event.ownerWalletAddress != data.walletAddress) {
          return next(new AttendifyError("Only Owner can request link"));
        }

        const masked = hashids.encode(event.id);
        res.json({
          result: masked,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Request a list of all events
   * @route GET /events/all
   * @param networkId - network identifier
   * @param limit - maximum number of returned results
   * @returns list of event json objects
   */
  app.get(
    "/events/all",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware("admin"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(APIGetEventsAll, req.query, {
          strategy: "exposeAll",
          excludeExtraneousValues: true,
        });
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const result = await AttendifyLib.getEventsAll(
          data.networkId,
          data.limit
        );
        res.json({
          result: result,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Request a list of events owned by a user
   * @route GET /events/owned
   * @param networkId - network identifier
   * @param limit - maximum number of returned results
   * @returns list of event json objects
   */
  app.get(
    "/events/owned",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware("organizer"),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(
          APIGetEventsOwned,
          {
            ...req.query,
            walletAddress: (req.auth as JwtPayload)?.walletAddress,
          },
          {
            strategy: "exposeAll",
            excludeExtraneousValues: true,
          }
        );
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const result = await AttendifyLib.getEventsOwned(
          data.networkId,
          data.walletAddress,
          data.limit
        );
        res.json({
          result: result,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Verify event NFT ownership
   * @route GET /ownership/verify/
   * @returns true, if the account is a legit participant
   */
  app.get(
    "/ownership/verify",
    authMiddleware({
      secret: config.server.jwtSecret,
      algorithms: ["HS256"],
    }),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(
          APIGetOwnershipVerify,
          {
            ...req.query,
            walletAddress: (req.auth as JwtPayload)?.walletAddress,
          },
          {
            strategy: "exposeAll",
            excludeExtraneousValues: true,
          }
        );
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const values = hashids.decode(data.maskedEventId);
        if (values.length != 1) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Invalid masked event ID",
              errors
            )
          );
        }

        const eventId = values[0].valueOf() as number;
        const result = await AttendifyLib.checkNFTOwnership(
          data.networkId,
          data.walletAddress,
          data.ownerWalletAddress,
          eventId
        );
        res.json({
          result: result,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Request a list of NFT offers owned by a user
   * @route GET /offers
   * @param networkId - network identifier
   * @param limit - maximum number of results that should be returned
   * @returns list of offer json objects (including associated event info)
   */
  app.get(
    "/offers",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(
          APIGetOffers,
          {
            ...req.query,
            walletAddress: (req.auth as JwtPayload)?.walletAddress,
          },
          {
            strategy: "exposeAll",
            excludeExtraneousValues: true,
          }
        );
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const result = await AttendifyLib.getOffers(
          data.networkId,
          data.walletAddress,
          data.limit
        );
        res.json({
          result: result,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Request user profile information
   * @route GET /user/info
   * @param includeEvents - optionally include user event information
   * @returns user json object
   */
  app.get(
    "/user/info",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(
          APIGetUserInfo,
          {
            ...req.query,
            walletAddress: (req.auth as JwtPayload)?.walletAddress,
          },
          {
            strategy: "exposeAll",
            excludeExtraneousValues: true,
          }
        );
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const result = await AttendifyLib.getUser(
          data.walletAddress,
          Boolean(data.includeEvents),
          false,
          false
        );
        res.json({
          result: result,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Update the user profile
   * @route POST /user/update
   * @param firstName - optional first name
   * @param lastName - optional last name
   * @param email - optional email address
   * @returns true, if the operation was successful
   */
  app.post(
    "/user/update",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(
          APIPostUserUpdate,
          {
            ...req.body,
            walletAddress: (req.auth as JwtPayload)?.walletAddress,
          },
          {
            strategy: "exposeAll",
            excludeExtraneousValues: true,
          }
        );
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        await AttendifyLib.updateUser(
          data.walletAddress,
          data.firstName,
          data.lastName,
          data.email
        );
        res.json({
          result: true,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Request a list of all user wallet addresses on the platform
   * @route GET /users/lookup
   * @returns list of user wallet addresses
   */
  app.get(
    "/users/lookup",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware("organizer"),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        const key = "_api_users_lookup";
        let addresses = cache.get<string[]>(key);
        if (!addresses) {
          const result = await AttendifyLib.getUsers(NetworkIdentifier.UNKNOWN);
          addresses = result.map((user) => user.walletAddress);
          cache.set<string[]>(key, addresses, 120);
        }
        res.json({
          result: addresses,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Request a list of all organizers on the platform
   * @route GET /users/organizers
   * @returns list of user json objects
   */
  app.get(
    "/users/organizers",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware("admin"),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        const users = await AttendifyLib.getOrganizers(
          NetworkIdentifier.UNKNOWN
        );
        res.json({
          result: users,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Ping backend service
   * @route POST /auth/heartbeat
   * @returns true, if the operation was successful
   */
  app.get(
    "/auth/heartbeat",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.json({
          result: true,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Request login nonce
   * @route POST /auth/nonce
   * @param pubkey - wallet public related to the wallet address
   * @returns temporary authentication nonce
   */
  app.post(
    "/auth/nonce",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(APIPostAuthNonce, req.body, {
          strategy: "exposeAll",
          excludeExtraneousValues: true,
        });
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const tempJwt = await generateTempToken(data.pubkey);
        res.json({
          result: tempJwt,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Authenticate with the backend service
   * @route POST /auth/login
   * @param walletType - wallet used for authentication (e.g. Xumm or Gem)
   * @param data - temporary authentication token or signed message
   * @param signature - optional signature (required for the Gem wallet)
   * @param claimFlow - login from the NFT claim flow (do not add organizer permissions)
   * @returns jwt authentication token
   */
  app.post(
    "/auth/login",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(APIPostAuthLogin, req.body, {
          strategy: "exposeAll",
          excludeExtraneousValues: true,
        });
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const user = await AttendifyLib.getUser(
          data.walletAddress,
          false,
          true,
          !data.claimFlow
        );
        assert(user);

        const permissions: Permission[] = [
          "attendee",
          ...(user.isOrganizer ? ["organizer" as Permission] : []),
          ...(user.isAdmin ? ["admin" as Permission] : []),
        ];

        if (data.walletType == WalletType.XUMM_WALLET) {
          const valid = await verifyXummToken(data.data, data.walletAddress);

          if (valid) {
            res.json({
              result: await generateToken(
                user.walletAddress,
                permissions,
                false
              ),
            });
          } else {
            return next(
              new ServerError(
                HttpStatusCode.BadRequest,
                "Xumm token verification failed"
              )
            );
          }
        } else if (data.walletType == WalletType.GEM_WALLET) {
          if (!data.signature) {
            return next(
              new ServerError(
                HttpStatusCode.BadRequest,
                "Missing Gem signature"
              )
            );
          }

          const valid = await verifyGemToken(
            data.data,
            data.signature,
            data.walletAddress
          );
          if (valid) {
            res.json({
              result: await generateToken(
                user.walletAddress,
                permissions,
                true
              ),
            });
          } else {
            return next(
              new ServerError(
                HttpStatusCode.BadRequest,
                "Gem token verification failed"
              )
            );
          }
        } else {
          return next(
            new ServerError(HttpStatusCode.BadRequest, "Invalid login type")
          );
        }
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Refresh an existing, valid jwt
   * @route POST /auth/refresh
   * @returns new jwt, if refreshable else null
   */
  app.post(
    "/auth/refresh",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        const { walletAddress, permissions, refreshable } =
          req.auth as JwtPayload;
        if (refreshable) {
          res.json({
            result: await generateToken(
              walletAddress,
              permissions,
              refreshable
            ),
          });
        } else {
          res.json({
            result: null,
          });
        }
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Verify an event deposit transaction
   * @route POST /payment/check
   * @param networkId - network identifier
   * @param txHash - transaction hash
   * @returns true, if the payment was successful
   */
  app.post(
    "/payment/check",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware("organizer"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(APIPostPaymentCheck, req.body, {
          strategy: "exposeAll",
          excludeExtraneousValues: true,
        });
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const success = await AttendifyLib.checkPayment(
          data.networkId,
          data.txHash
        );
        res.json({
          result: success,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Request platform usage information
   * @route GET /admin/stats
   * @param networkId - network identifier
   * @returns usage statistics
   */
  app.get(
    "/admin/stats",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware("admin"),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(APIGetAdminStats, req.query, {
          strategy: "exposeAll",
          excludeExtraneousValues: true,
        });
        const errors = await validate(data);
        if (errors.length > 0) {
          return next(
            new ServerError(
              HttpStatusCode.BadRequest,
              "Data validation failed",
              errors
            )
          );
        }

        const key = "_api_admin_stats";
        let stats = cache.get<PlatformStats>(key);
        if (!stats) {
          stats = await AttendifyLib.getStats(data.networkId);
          cache.set<PlatformStats>(key, stats, 30);
        }
        res.json({
          result: stats,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  app.use(errorHandler);

  return app;
}
