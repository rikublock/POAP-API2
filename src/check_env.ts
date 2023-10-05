import { isValidSecret } from "xrpl";
import "reflect-metadata";
import { Type, Expose } from "class-transformer";
import {
  IsAlphanumeric,
  IsInt,
  IsJWT,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  Min,
  registerDecorator,
  validate,
  ValidateIf,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import { plainToClass } from "class-transformer";
import "dotenv/config";

@ValidatorConstraint({ name: "isValidSecret", async: false })
class XrpSecretConstraint implements ValidatorConstraintInterface {
  validate(secret: string, args: ValidationArguments) {
    return isValidSecret(secret);
  }

  defaultMessage(args: ValidationArguments) {
    return "Value ($value) is not a valid XRP secret!";
  }
}

export function IsXrpSecret(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: XrpSecretConstraint,
    });
  };
}

export class EnvVariables {
  @Expose()
  @IsUrl({ protocols: ["http", "https", "ws", "wss"] })
  MAINNET_URL: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.MAINNET_VAULT_WALLET_SEED !== "")
  @IsXrpSecret()
  MAINNET_VAULT_WALLET_SEED?: string;

  @Expose()
  @IsUrl({ protocols: ["http", "https", "ws", "wss"] })
  TESTNET_URL: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.TESTNET_VAULT_WALLET_SEED !== "")
  @IsXrpSecret()
  TESTNET_VAULT_WALLET_SEED?: string;

  @Expose()
  @IsUrl({ protocols: ["http", "https", "ws", "wss"] })
  DEVNET_URL: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.DEVNET_VAULT_WALLET_SEED !== "")
  @IsXrpSecret()
  DEVNET_VAULT_WALLET_SEED?: string;

  @Expose()
  @IsUrl({ protocols: ["http", "https", "ws", "wss"] })
  AMM_DEVNET_URL: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.AMM_DEVNET_VAULT_WALLET_SEED !== "")
  @IsXrpSecret()
  AMM_DEVNET_VAULT_WALLET_SEED?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.IPFS_INFURA_ID !== "")
  @IsAlphanumeric()
  @Length(32)
  IPFS_INFURA_ID?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.IPFS_INFURA_SECRET !== "")
  @IsAlphanumeric()
  @Length(32)
  IPFS_INFURA_SECRET?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.IPFS_WEB3_STORAGE_API_TOKEN !== "")
  @IsJWT()
  IPFS_WEB3_STORAGE_API_TOKEN?: string;

  @Expose()
  @IsString()
  @IsUUID(4)
  XUMM_API_KEY: string;

  @Expose()
  @IsString()
  @IsUUID(4)
  XUMM_API_SECRET: string;

  @Expose()
  @IsString()
  @IsAlphanumeric()
  @Length(64)
  JWT_SECRET: string;

  @Expose()
  @IsString()
  @IsAlphanumeric()
  @Length(32, 64)
  HASHID_SALT: string;

  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(250)
  MAX_TICKETS: number;

  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  MAX_EVENT_SLOTS: number;
}

async function check() {
  const plain = {
    MAINNET_URL: process.env.MAINNET_URL as string,
    MAINNET_VAULT_WALLET_SEED: process.env.MAINNET_VAULT_WALLET_SEED as string,
    TESTNET_URL: process.env.TESTNET_URL as string,
    TESTNET_VAULT_WALLET_SEED: process.env.TESTNET_VAULT_WALLET_SEED as string,
    DEVNET_URL: process.env.DEVNET_URL as string,
    DEVNET_VAULT_WALLET_SEED: process.env.DEVNET_VAULT_WALLET_SEED as string,
    AMM_DEVNET_URL: process.env.AMM_DEVNET_URL as string,
    AMM_DEVNET_VAULT_WALLET_SEED: process.env
      .AMM_DEVNET_VAULT_WALLET_SEED as string,
    IPFS_INFURA_ID: process.env.IPFS_INFURA_ID as string,
    IPFS_INFURA_SECRET: process.env.IPFS_INFURA_SECRET as string,
    IPFS_WEB3_STORAGE_API_TOKEN: process.env
      .IPFS_WEB3_STORAGE_API_TOKEN as string,
    XUMM_API_KEY: process.env.XUMM_API_KEY as string,
    XUMM_API_SECRET: process.env.XUMM_API_SECRET as string,
    JWT_SECRET: process.env.JWT_SECRET as string,
    HASHID_SALT: process.env.HASHID_SALT as string,
    MAX_TICKETS: process.env.MAX_TICKETS as string,
    MAX_EVENT_SLOTS: process.env.MAX_EVENT_SLOTS as string,
  };

  const data = plainToClass(EnvVariables, plain, {
    strategy: "exposeAll",
    excludeExtraneousValues: true,
  });

  const errors = await validate(data);
  if (errors.length > 0) {
    console.error(errors);
  }

  if (
    !(
      data.MAINNET_VAULT_WALLET_SEED ||
      data.TESTNET_VAULT_WALLET_SEED ||
      data.DEVNET_VAULT_WALLET_SEED ||
      data.AMM_DEVNET_VAULT_WALLET_SEED
    )
  ) {
    console.error(
      "Error: Need a wallet secret (seed) for at least one network"
    );
  }

  if (
    !(
      (data.IPFS_INFURA_ID && data.IPFS_INFURA_SECRET) ||
      data.IPFS_WEB3_STORAGE_API_TOKEN
    )
  ) {
    console.error("Error: Need credentials for at least one IFPS provider");
  }
}

check();
