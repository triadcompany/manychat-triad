// Cria o platform admin inicial + a organização "Triad Company", já que
// ainda não existe tela de cadastro (self-service fica pra uma fase
// posterior — ver docs/2026-09-22-saas-scaffolding-design.md).
//
// Uso: npm run create-user -- <email> <senha> "<nome completo>"
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";

const ORG_NAME = "Triad Company";

async function main() {
  const [email, password, fullName] = process.argv.slice(2);
  if (!email || !password || !fullName) {
    console.error('Uso: npm run create-user -- <email> <senha> "<nome completo>"');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Faltou DATABASE_URL no ambiente.");
    process.exit(1);
  }

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  try {
    let org = await db.query.organizations.findFirst({
      where: eq(schema.organizations.name, ORG_NAME),
    });
    if (!org) {
      [org] = await db.insert(schema.organizations).values({ name: ORG_NAME }).returning();
      console.log(`Organização "${ORG_NAME}" criada (${org.id}).`);
    }

    const existing = await db.query.users.findFirst({
      where: eq(schema.users.email, email.trim().toLowerCase()),
    });
    if (existing) {
      console.error(`Já existe um usuário com o email ${email}.`);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(schema.users)
      .values({ email: email.trim().toLowerCase(), passwordHash, isPlatformAdmin: true })
      .returning();
    await db.insert(schema.profiles).values({
      id: user.id,
      fullName,
      role: "admin",
      organizationId: org.id,
    });

    console.log(`Usuário ${user.email} criado como platform admin da organização "${ORG_NAME}".`);
  } finally {
    await client.end();
  }
}

main();
