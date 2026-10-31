// Seed: initialiseert het admin-account (geen publieke registratie)
// Credentials komen uit environment-variables of worden gegenereerd.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@gps.local";
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD;

  let passwordHash: string;
  let generatedPassword: string | null = null;

  if (password && password.length >= 8) {
    passwordHash = await bcrypt.hash(password, 10);
  } else {
    // Genereer een sterk wachtwoord als er geen is ingesteld
    generatedPassword = randomBytes(12).toString("base64url");
    passwordHash = await bcrypt.hash(generatedPassword, 10);
  }

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      // Wachtwoord bijwerken als ADMIN_PASSWORD is ingesteld
      ...(password ? { passwordHash } : {}),
    },
    create: {
      email,
      username,
      passwordHash,
      role: "admin",
    },
  });

  // Optionele build-in API-key voor Android-demo
  const buildKey = process.env.ADMIN_BUILD_API_KEY;
  if (buildKey) {
    const keyHash = createHash("sha256").update(buildKey).digest("hex");
    await prisma.apiKey.upsert({
      where: { keyHash },
      update: {},
      create: {
        userId: admin.id,
        keyHash,
        keyPrefix: buildKey.slice(0, 12),
        label: "Build-in admin key",
      },
    });
  }

  console.log(`Admin-account: ${email} (${username})`);
  if (generatedPassword) {
    console.log(`Gegenereerd wachtwoord: ${generatedPassword}`);
    console.log("Bewaar dit veilig! Je kunt het wijzigen via ADMIN_PASSWORD in .env en opnieuw seeden.");
  }
  if (buildKey) console.log(`Build-key geregistreerd (prefix: ${buildKey.slice(0, 12)}…)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
