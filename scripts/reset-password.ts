// Recuperação de senha manual — ainda não existe "esqueci minha senha"
// self-service (depende de envio de email, fora de escopo por ora, ver
// docs/2026-09-22-saas-self-service-auth-design.md). Suporte roda isto
// quando alguém perde acesso.
//
// Uso: npm run reset-password -- <email> <nova-senha>
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";

async function main() {
  const [email, newPassword] = process.argv.slice(2);
  if (!email || !newPassword) {
    console.error("Uso: npm run reset-password -- <email> <nova-senha>");
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error("A senha precisa ter pelo menos 8 caracteres.");
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
    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, email.trim().toLowerCase()),
    });
    if (!user) {
      console.error(`Nenhum usuário com o email ${email}.`);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, user.id));

    console.log(`Senha atualizada para ${user.email}.`);
  } finally {
    await client.end();
  }
}

main();
