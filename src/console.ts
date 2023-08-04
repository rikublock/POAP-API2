import { isValidClassicAddress } from "xrpl";
import { Command } from "commander";

import { db, User } from "./attendify/models";

async function addAdmin(
  address: string,
  allowCreation: boolean
): Promise<void> {
  console.log("address:", address);
  console.log("allow_create:", allowCreation);

  if (!isValidClassicAddress(address)) {
    console.error("Error: Invalid address");
    return;
  }

  const options = {
    where: { walletAddress: address },
  };

  if (allowCreation) {
    const [user, created] = await User.findOrCreate({
      ...options,
      defaults: {
        walletAddress: address,
        isOrganizer: false,
        isAdmin: true,
        slots: 0,
      },
    });
    if (created) {
      console.info("Created new admin user");
    } else {
      user.isAdmin = true;
      await user.save();
    }
  } else {
    const user = await User.findOne(options);
    if (!user) {
      console.error("Error: Unable to find user");
      return;
    }

    user.isAdmin = true;
    await user.save();
  }

  console.log("Successfully added admin flag");
}

async function removeAdmin(address: string): Promise<void> {
  console.log("address", address);

  if (!isValidClassicAddress(address)) {
    console.error("Error: Invalid address");
    return;
  }

  const user = await User.findOne({ where: { walletAddress: address } });
  if (!user) {
    console.error("Error: Unable to find user");
    return;
  }

  user.isAdmin = false;
  await user.save();

  console.log("Successfully removed admin flag");
}

async function main() {
  // init database
  await db.authenticate();
  await db.sync({ force: false });

  const program = new Command();
  program.description("Utility tool to manage the POAP backend.");

  const command = program
    .command("admin")
    .description("manage admin accounts in the database");

  command
    .command("add")
    .description("set admin flag for account in database")
    .argument("<address>", "user wallet address")
    .argument("[allow_create]", "allow the creation of a new user account")
    .action(async (address, allow_create) => {
      await addAdmin(address, ["true", "1"].includes(allow_create));
    });

  command
    .command("remove")
    .description("remove admin flag from account in database")
    .argument("<address>", "user wallet address")
    .action(async (address) => {
      await removeAdmin(address);
    });

  await program.parseAsync(process.argv);

  await db.close();
}

main();
