import { isValidClassicAddress } from "xrpl";
import "reflect-metadata";
import { Type, Transform, Expose } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsEmail,
  IsEnum,
  IsHexadecimal,
  IsInt,
  IsJWT,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
  NotEquals,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import config from "../config";
import { NetworkIdentifier, WalletType } from "../types";
import { hashids } from "./util";

@ValidatorConstraint({ name: "isValidAddress", async: false })
class XrpAddressConstraint implements ValidatorConstraintInterface {
  validate(address: string, args: ValidationArguments) {
    return isValidClassicAddress(address);
  }

  defaultMessage(args: ValidationArguments) {
    return "Value ($value) is not a valid XRP address!";
  }
}

export function IsXrpAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: XrpAddressConstraint,
    });
  };
}

@ValidatorConstraint({ name: "isValidHashid", async: false })
class HashidConstraint implements ValidatorConstraintInterface {
  validate(id: string, args: ValidationArguments) {
    if (typeof id !== "string") {
      return false;
    } else if (
      id.length < config.server.hashidLength ||
      id.length > 2 * config.server.hashidLength
    ) {
      return false;
    } else {
      return hashids.isValidId(id);
    }
  }

  defaultMessage(args: ValidationArguments) {
    return "Value ($value) is not a valid hash ID!";
  }
}

export function IsHashid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: HashidConstraint,
    });
  };
}

@ValidatorConstraint({ name: "isNotTrimmable", async: false })
class NotTrimmableConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    return value === value?.trim();
  }

  defaultMessage(args: ValidationArguments) {
    return "Value ($value) contains trimmable whitespace characters!";
  }
}

export function IsNotTrimmable(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: NotTrimmableConstraint,
    });
  };
}

export class APIGetEventMinter {
  @Expose()
  @Type(() => Number)
  @IsEnum(NetworkIdentifier)
  @NotEquals(NetworkIdentifier.UNKNOWN)
  networkId: NetworkIdentifier;

  @Expose()
  @IsXrpAddress()
  walletAddress: string;
}

export class APIPostEventCreate {
  @Expose()
  @IsEnum(NetworkIdentifier)
  @NotEquals(NetworkIdentifier.UNKNOWN)
  networkId: NetworkIdentifier;

  @Expose()
  @IsXrpAddress()
  walletAddress: string;

  @Expose()
  @IsInt()
  @Min(1)
  @Max(config.server.maxEventSlots)
  tokenCount: number;

  @Expose()
  @IsUrl()
  imageUrl: string;

  @Expose()
  @IsString()
  @IsNotTrimmable()
  @Length(1, 256)
  title: string;

  @Expose()
  @IsString()
  @Length(1, 10000)
  description: string;

  @Expose()
  @IsString()
  @Length(1, 256)
  location: string;

  @Expose()
  @IsDate()
  @Type(() => Date)
  dateStart: Date;

  @Expose()
  @IsDate()
  @Type(() => Date)
  dateEnd: Date;

  @Expose()
  @IsBoolean()
  isManaged: boolean;
}

export class APIPostEventCancel {
  @Expose()
  @IsXrpAddress()
  walletAddress: string;

  @Expose()
  @IsInt()
  @Min(1)
  eventId: number;
}

export class APIPostEventJoin {
  @Expose()
  @IsXrpAddress()
  walletAddress: string;

  @Expose()
  @IsHashid()
  maskedEventId: string;

  @Expose()
  @IsBoolean()
  createOffer: boolean;
}

export class APIPostEventClaim {
  @Expose()
  @IsXrpAddress()
  walletAddress: string;

  @Expose()
  @IsHashid()
  maskedEventId: string;
}

export class APIPostEventInvite {
  @Expose()
  @IsXrpAddress()
  walletAddress: string;

  @Expose()
  @IsInt()
  @Min(1)
  eventId: number;

  @Expose()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsXrpAddress({
    each: true,
  })
  attendeeWalletAddresses: string[];
}

export class APIGetEventInfo {
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id: number;

  @Expose()
  @IsOptional()
  @IsXrpAddress()
  walletAddress?: string;
}

export class APIGetEventLink {
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id: number;

  @Expose()
  @IsOptional()
  @IsXrpAddress()
  walletAddress: string;
}

export class APIGetEventsAll {
  @Expose()
  @Type(() => Number)
  @IsEnum(NetworkIdentifier)
  @NotEquals(NetworkIdentifier.UNKNOWN)
  networkId: NetworkIdentifier;

  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number;
}

export class APIGetEventsOwned {
  @Expose()
  @Type(() => Number)
  @IsEnum(NetworkIdentifier)
  @NotEquals(NetworkIdentifier.UNKNOWN)
  networkId: NetworkIdentifier;

  @Expose()
  @IsXrpAddress()
  walletAddress: string;

  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class APIGetOffers {
  @Expose()
  @Type(() => Number)
  @IsEnum(NetworkIdentifier)
  @NotEquals(NetworkIdentifier.UNKNOWN)
  networkId: NetworkIdentifier;

  @Expose()
  @IsXrpAddress()
  walletAddress: string;

  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class APIGetUserInfo {
  @Expose()
  @IsXrpAddress()
  walletAddress: string;

  @Expose()
  @Transform(({ value }) => {
    return [true, "true", 1, "1"].indexOf(value) > -1;
  })
  @IsBoolean()
  includeEvents?: boolean;
}

export class APIPostUserUpdate {
  @Expose()
  @IsXrpAddress()
  walletAddress: string;

  @Expose()
  @IsOptional()
  @IsString()
  @IsNotTrimmable()
  @Length(1, 64)
  firstName: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @IsNotTrimmable()
  @Length(1, 64)
  lastName: string | null;

  @Expose()
  @IsOptional()
  @IsEmail()
  email: string | null;
}

export class APIPostAuthNonce {
  @Expose()
  @IsHexadecimal()
  @Length(1, 66)
  pubkey: string;
}

export class APIPostAuthLogin {
  @Expose()
  @IsXrpAddress()
  walletAddress: string;

  @Expose()
  @IsEnum(WalletType)
  walletType: WalletType;

  @Expose()
  @IsJWT()
  data: string;

  @Expose()
  @IsOptional()
  @IsHexadecimal()
  @Length(64, 128)
  signature?: string;

  @Expose()
  @IsBoolean()
  claimFlow: boolean;
}

export class APIPostPaymentCheck {
  @Expose()
  @Type(() => Number)
  @IsEnum(NetworkIdentifier)
  @NotEquals(NetworkIdentifier.UNKNOWN)
  networkId: NetworkIdentifier;

  @Expose()
  @IsHexadecimal()
  @Length(64, 66)
  txHash: string;
}

export class APIGetAdminStats {
  @Expose()
  @Type(() => Number)
  @IsEnum(NetworkIdentifier)
  @NotEquals(NetworkIdentifier.UNKNOWN)
  networkId: NetworkIdentifier;
}
