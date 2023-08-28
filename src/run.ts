import { HttpStatusCode } from "axios";
import type { Request, Response, NextFunction } from "express";
import express from "express";
import {
  expressjwt as authMiddleware,
  Request as JWTRequest,
} from "express-jwt";
import cors from "cors";
import { validate } from "class-validator";
import { plainToClass } from "class-transformer";
import NodeCache from "node-cache";
import Hashids from "hashids";

import { Attendify } from "./attendify";
import { postToIPFS } from "./server/ipfs";
import { WalletType, Metadata, NetworkIdentifier } from "./types";
import {
  APIGetEventInfo,
  APIGetEventLink,
  APIGetEventMinter,
  APIGetEventsOwned,
  APIGetEventsPublic,
  APIGetOffers,
  APIGetUserInfo,
  APIGetUserSlots,
  APIPostAuthLogin,
  APIPostAuthNonce,
  APIPostEventClaim,
  APIPostEventCreate,
  APIPostEventInvite,
  APIPostEventJoin,
  APIPostUserUpdate,
} from "./server/validate";
import { ServerError, errorHandler } from "./server/error";
import config from "./config";
import {
  JwtPayload,
  Permission,
  generateTempToken,
  generateToken,
  verifyGemToken,
  verifyXummToken,
} from "./server/auth";
import { AttendifyError } from "./attendify/error";
import { guardMiddleware } from "./server/guard";

export async function main() {
  const AttendifyLib = new Attendify(config.attendify.networkConfigs);
  await AttendifyLib.init();

  const cache = new NodeCache({ stdTTL: 600 });

  const hashids = new Hashids(config.server.hashidSalt, 24);

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
   * Create a new event and uploads metadata to IPFS
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

        const metadataUrl = await postToIPFS(JSON.stringify(metadata));

        const eventId = await AttendifyLib.createEvent(
          data.networkId,
          data.walletAddress,
          metadata,
          metadataUrl,
          data.isManaged
        );
        res.json({
          result: {
            eventId,
            metadataUri: metadataUrl,
          },
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Sign up for an event
   * @route POST /event/join
   * @param eventId - event identifier
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

        const claim = await AttendifyLib.addParticipant(
          data.eventId,
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
   * @param eventId - event identifier
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

        const claim = await AttendifyLib.getClaim(
          data.walletAddress,
          data.eventId
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
   * Request details about an event
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
        // verify request data
        const data = plainToClass(
          APIGetEventInfo,
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

        const result = await AttendifyLib.getEvent(data.id, data.walletAddress);
        res.json({
          result: result,
        });
      } catch (error) {
        return next(next);
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

        const event = await AttendifyLib.getEvent(data.id, data.walletAddress);
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
        return next(next);
      }
    }
  );

  /**
   * Request a list of public events
   * @route GET /events/public
   * @param networkId - network identifier
   * @param limit - maximum number of returned results
   * @returns list of event json objects
   */
  app.get(
    "/events/public",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(APIGetEventsPublic, req.query, {
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

        const result = await AttendifyLib.getEventsPublic(
          data.networkId,
          data.limit
        );
        res.json({
          result: result,
        });
      } catch (error) {
        return next(next);
      }
    }
  );

  /**
   * Request a list of events owned by a user
   * @route GET /events/owned
   * @param networkId - network identifier
   * @param limit - maximum number of returned results
   * @param includeAttendees - optionally include event attendees information
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
          data.limit,
          data.includeAttendees
        );
        res.json({
          result: result,
        });
      } catch (error) {
        return next(next);
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
        return next(next);
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
          data.includeEvents,
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
   * Request user event slot information
   * @route GET /user/slots
   * @param networkId - network identifier
   * @returns currently used and max available slots
   */
  app.get(
    "/user/slots",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware("organizer"),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // verify request data
        const data = plainToClass(
          APIGetUserSlots,
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

        const result = await AttendifyLib.getSlots(
          data.networkId,
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
   * Request a list of all users on the platform
   * @route GET /users
   * @returns list of user wallet addresses
   */
  app.get(
    "/users",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware("organizer"),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        const key = "_api_users";
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
          true
        );
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
   * Request platform usage information
   * @route GET /admin/stats
   * @returns usage statistics
   */
  app.get(
    "/admin/stats",
    authMiddleware({ secret: config.server.jwtSecret, algorithms: ["HS256"] }),
    guardMiddleware("admin"),
    async (req: JWTRequest, res: Response, next: NextFunction) => {
      try {
        // TODO
        res.json({
          result: true,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  app.use(errorHandler);

  app.listen(config.server.port, () => {
    console.log(
      `XRPL Attendify server listening on port http://localhost:${config.server.port}`
    );
  });
}

main();
