// Wachtwoord-reset voor de admin
// Gebruik: npx tsx scripts/reset-password.ts <nieuw-wachtwoord>
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const newPassword = process.argv[2];
  if (!newPassword || newPassword.length < 8) {
    console.error("Gebruik: npx tsx scripts/reset-password.ts <wachtwoord-min-8-tekens>");
    process.exit(1);
  }

  const email = process.env.ADMIN_EMAIL ?? "admin@gps.local";
  const passwordHash = await bcrypt.hash(newPassword, 10);

  const result = await prisma.user.updateMany({
    where: { email, role: "admin" },
    data: { passwordHash },
  });

  if (result.count === 0) {
    console.error(`Geen admin gevonden met e-mail: ${email}`);
    process.exit(1);
  }

  // Sessies intrekken na wachtwoordwijziging
  await prisma.session.updateMany({
    where: { user: { email, role: "admin" } },
    data: { revokedAt: new Date() },
  });

  console.log(`Wachtwoord gewijzigd voor ${email}. Alle sessies ingetrokken.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
