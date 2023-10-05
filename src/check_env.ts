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
  mainnetUrl: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.mainnetVaultWalletSeed !== "")
  @IsXrpSecret()
  mainnetVaultWalletSeed?: string;

  @Expose()
  @IsUrl({ protocols: ["http", "https", "ws", "wss"] })
  testnetUrl: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.testnetVaultWalletSeed !== "")
  @IsXrpSecret()
  testnetVaultWalletSeed?: string;

  @Expose()
  @IsUrl({ protocols: ["http", "https", "ws", "wss"] })
  devnetUrl: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.devnetVaultWalletSeed !== "")
  @IsXrpSecret()
  devnetVaultWalletSeed?: string;

  @Expose()
  @IsUrl({ protocols: ["http", "https", "ws", "wss"] })
  ammDevnetUrl: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.ammDevnetVaultWalletSeed !== "")
  @IsXrpSecret()
  ammDevnetVaultWalletSeed?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.ipfsInfuraId !== "")
  @IsAlphanumeric()
  @Length(32)
  ipfsInfuraId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.ipfsInfuraSecret !== "")
  @IsAlphanumeric()
  @Length(32)
  ipfsInfuraSecret?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.ipfsWeb3StorageApiToken !== "")
  @IsJWT()
  ipfsWeb3StorageApiToken?: string;

  @Expose()
  @IsString()
  @IsUUID(4)
  xummApiKey: string;

  @Expose()
  @IsString()
  @IsUUID(4)
  xummApiSecret: string;

  @Expose()
  @IsString()
  @IsAlphanumeric()
  @Length(64)
  jwtSecret: string;

  @Expose()
  @IsString()
  @IsAlphanumeric()
  @Length(32, 64)
  hashidSalt: string;

  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(250)
  maxTickets: number;

  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxEventSlots: number;
}

async function check() {
  const plain = {
    mainnetUrl: process.env.MAINNET_URL as string,
    mainnetVaultWalletSeed: process.env.MAINNET_VAULT_WALLET_SEED as string,
    testnetUrl: process.env.TESTNET_URL as string,
    testnetVaultWalletSeed: process.env.TESTNET_VAULT_WALLET_SEED as string,
    devnetUrl: process.env.DEVNET_URL as string,
    devnetVaultWalletSeed: process.env.DEVNET_VAULT_WALLET_SEED as string,
    ammDevnetUrl: process.env.AMM_DEVNET_URL as string,
    ammDevnetVaultWalletSeed: process.env
      .AMM_DEVNET_VAULT_WALLET_SEED as string,
    ipfsInfuraId: process.env.IPFS_INFURA_ID as string,
    ipfsInfuraSecret: process.env.IPFS_INFURA_SECRET as string,
    ipfsWeb3StorageApiToken: process.env.IPFS_WEB3_STORAGE_API_TOKEN as string,
    xummApiKey: process.env.XUMM_API_KEY as string,
    xummApiSecret: process.env.XUMM_API_SECRET as string,
    jwtSecret: process.env.JWT_SECRET as string,
    hashidSalt: process.env.HASHID_SALT as string,
    maxTickets: process.env.MAX_TICKETS as string,
    maxEventSlots: process.env.MAX_EVENT_SLOTS as string,
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
      data.mainnetVaultWalletSeed ||
      data.testnetVaultWalletSeed ||
      data.devnetVaultWalletSeed ||
      data.ammDevnetVaultWalletSeed
    )
  ) {
    console.error("Error: Need a wallet secret (seed) for at least one network");
  }

  if (
    !(
      (data.ipfsInfuraId && data.ipfsInfuraSecret) ||
      data.ipfsWeb3StorageApiToken
    )
  ) {
    console.error("Error: Need credentials for at least one IFPS provider");
  }
}

check();
