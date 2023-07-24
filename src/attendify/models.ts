import {
  Association,
  BelongsToManyAddAssociationMixin,
  BelongsToManyCountAssociationsMixin,
  BelongsToManyGetAssociationsMixin,
  BelongsToManyHasAssociationMixin,
  BelongsToManyRemoveAssociationMixin,
  CreationOptional,
  DataTypes,
  ForeignKey,
  HasManyCountAssociationsMixin,
  HasManyCreateAssociationMixin,
  HasManyHasAssociationMixin,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
  Sequelize,
} from "sequelize";

import { EventStatus, NetworkIdentifier } from "../types";
import config from "../config";

let sequelize: Sequelize;
if (config.isTesting) {
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: ":memory:",
    logging: false,
    define: {
      timestamps: false,
    },
  });
} else {
  sequelize = new Sequelize(config.attendify.db);
}

export const db = sequelize;

export class User extends Model<
  InferAttributes<User, { omit: "events" | "attendances" | "claims" }>,
  InferCreationAttributes<User, { omit: "events" | "attendances" | "claims" }>
> {
  declare walletAddress: string;
  declare firstName: string | null;
  declare lastName: string | null;
  declare email: string | null;
  declare isOrganizer: boolean;
  declare isAdmin: boolean;
  declare slots: number;

  // Note: The expression 'event' is used for events owned (created)
  // by the user and 'attendance' for events the user is participating in.
  declare hasEvent: HasManyHasAssociationMixin<Event, number>;
  declare countEvents: HasManyCountAssociationsMixin;
  declare createEvent: HasManyCreateAssociationMixin<
    Event,
    "ownerWalletAddress"
  >;

  declare events?: NonAttribute<Event[]>;

  declare addAttendance: BelongsToManyAddAssociationMixin<Event, number>;
  declare countAttendances: BelongsToManyCountAssociationsMixin;
  declare getAttendances: BelongsToManyGetAssociationsMixin<Event>;
  declare hasAttendance: BelongsToManyHasAssociationMixin<Event, number>;
  declare removeAttendance: BelongsToManyRemoveAssociationMixin<Event, number>;

  declare attendances?: NonAttribute<Event[]>;

  declare hasClaim: HasManyHasAssociationMixin<Claim, number>;
  declare countClaims: HasManyCountAssociationsMixin;
  declare createClaim: HasManyCreateAssociationMixin<
    Claim,
    "ownerWalletAddress"
  >;

  declare claims?: NonAttribute<Claim[]>;

  declare static associations: {
    events: Association<User, Event>;
    attendances: Association<User, Event>;
    claims: Association<User, Claim>;
  };
}

User.init(
  {
    walletAddress: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    isOrganizer: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    slots: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "user",
  }
);

export class Event extends Model<
  InferAttributes<Event, { omit: "attendees" | "nfts" }>,
  InferCreationAttributes<Event, { omit: "attendees" | "nfts" }>
> {
  declare id: CreationOptional<number>;
  declare status: EventStatus;
  declare networkId: NetworkIdentifier;
  declare title: string;
  declare description: string;
  declare location: string;
  declare imageUrl: string;
  declare uri: string;
  declare tokenCount: number;
  declare dateStart: Date;
  declare dateEnd: Date;
  declare isManaged: boolean;

  declare ownerWalletAddress: ForeignKey<User["walletAddress"]>;
  declare owner?: NonAttribute<User>;

  declare addAttendee: BelongsToManyAddAssociationMixin<User, string>;
  declare countAttendees: BelongsToManyCountAssociationsMixin;
  declare getAttendees: BelongsToManyGetAssociationsMixin<User>;
  declare hasAttendee: BelongsToManyHasAssociationMixin<User, string>;
  declare removeAttendee: BelongsToManyRemoveAssociationMixin<User, string>;

  declare attendees?: NonAttribute<User[]>;

  declare countNfts: HasManyCountAssociationsMixin;
  declare createNft: HasManyCreateAssociationMixin<NFT, "eventId">;
  declare hasNft: HasManyHasAssociationMixin<NFT, string>;

  declare nfts?: NonAttribute<NFT[]>;

  declare static associations: {
    owner: Association<Event, User>;
    attendees: Association<Event, User>;
    nfts: Association<Event, NFT>;
  };
}

Event.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    networkId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(256),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(10000),
      allowNull: false,
    },
    location: {
      type: DataTypes.STRING(256),
      allowNull: false,
    },
    imageUrl: {
      type: DataTypes.STRING(256),
      allowNull: false,
    },
    uri: {
      type: DataTypes.STRING(256),
      allowNull: false,
    },
    tokenCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    dateStart: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    dateEnd: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    isManaged: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "event",
    validate: {
      areValidDates() {
        if (
          new Date(this.dateEnd as string) < new Date(this.dateStart as string)
        ) {
          throw new Error("Event end must be after start");
        }
      },
    },
  }
);

class Participation extends Model<
  InferAttributes<Participation>,
  InferCreationAttributes<Participation>
> {
  declare id: CreationOptional<number>;
  declare userWalletAddress: ForeignKey<User["walletAddress"]>;
  declare eventId: ForeignKey<Event["id"]>;
}

Participation.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "participation",
  }
);

export class NFT extends Model<
  InferAttributes<NFT>,
  InferCreationAttributes<NFT>
> {
  declare id: string;
  declare issuerWalletAddress: ForeignKey<User["walletAddress"]>;
  declare eventId: ForeignKey<Event["id"]>;

  declare issuer?: NonAttribute<User>;
  declare event?: NonAttribute<Event>;
  declare claim?: NonAttribute<Claim>;

  declare static associations: {
    issuer: Association<NFT, User>;
    event: Association<NFT, Event>;
    claim: Association<NFT, Claim>;
  };
}

NFT.init(
  {
    id: {
      type: DataTypes.STRING(66),
      primaryKey: true,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "nft",
  }
);

export class Claim extends Model<
  InferAttributes<Claim>,
  InferCreationAttributes<Claim>
> {
  declare id: CreationOptional<number>;
  declare ownerWalletAddress: ForeignKey<User["walletAddress"]>;
  declare tokenId: ForeignKey<NFT["id"]>;
  declare offerIndex: string | null;
  declare claimed: boolean;

  declare owner?: NonAttribute<User>;
  declare token?: NonAttribute<NFT>;

  declare static associations: {
    owner: Association<Claim, User>;
    token: Association<Claim, NFT>;
  };
}

Claim.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    offerIndex: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    claimed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "claim",
  }
);

User.hasMany(Event, {
  sourceKey: "walletAddress",
  foreignKey: "ownerWalletAddress",
  as: "events",
});
Event.belongsTo(User, {
  targetKey: "walletAddress",
  foreignKey: "ownerWalletAddress",
  as: "owner",
});

Event.belongsToMany(User, {
  through: Participation,
  foreignKey: "eventId",
  otherKey: "userWalletAddress",
  as: "attendees",
});
User.belongsToMany(Event, {
  through: Participation,
  foreignKey: "userWalletAddress",
  otherKey: "eventId",
  as: "attendances",
});

Event.hasMany(NFT, {
  sourceKey: "id",
  foreignKey: "eventId",
  as: "nfts",
});
NFT.belongsTo(Event, {
  targetKey: "id",
  foreignKey: "eventId",
  as: "event",
});

NFT.belongsTo(User, {
  targetKey: "walletAddress",
  foreignKey: "issuerWalletAddress",
  as: "issuer",
});

User.hasMany(Claim, {
  sourceKey: "walletAddress",
  foreignKey: "ownerWalletAddress",
  as: "claims",
});
Claim.belongsTo(User, {
  targetKey: "walletAddress",
  foreignKey: "ownerWalletAddress",
  as: "owner",
});

NFT.hasOne(Claim, {
  sourceKey: "id",
  foreignKey: "tokenId",
  as: "claim",
});
Claim.belongsTo(NFT, {
  targetKey: "id",
  foreignKey: "tokenId",
  as: "token",
});

export const orm = {
  User,
  Event,
  NFT,
  Claim,
};
