import { relations } from "drizzle-orm/relations";
import {
  type AnyPgColumn,
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp as pgTimestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// timestamptz que devolve string ISO (não Date) — mantém o mesmo tipo que o
// resto do código já espera.
function timestamp(name: string) {
  return pgTimestamp(name, { withTimezone: true, mode: "string" });
}

// Unidade de isolamento multi-tenant — uma empresa que assina o produto.
// Todo dado do sistema pendura, direto ou indireto, numa organização.
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Credenciais próprias (bcrypt) — sem depender de provedor externo de auth.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Acesso de suporte fora do conceito de organização — lista/entra em qualquer uma.
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  // Desativado = login bloqueado.
  active: boolean("active").notNull().default(true),
});

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    role: text("role").notNull().default("member"),
    // Nulo só pro platform admin puro, que não pertence a nenhuma organização.
    organizationId: uuid("organization_id").references(() => organizations.id),
  },
  (t) => [check("profiles_role_check", sql`${t.role} IN ('admin', 'member')`)]
);

// Configuração livre por organização (chave/valor) — hoje usada só pra
// guardar a chave da API da OpenAI usada na classificação por IA do funil.
export const appConfig = pgTable(
  "app_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [unique("app_config_organization_id_key_key").on(t.organizationId, t.key)]
);

// ── Funil de vendas via Instagram ───────────────────────────────────────
// Comentário com palavra-chave num post específico dispara resposta privada
// automática no Direct via Instagram Messaging API.

export const instagramConnections = pgTable("instagram_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  instagramBusinessAccountId: text("instagram_business_account_id").notNull(),
  accessToken: text("access_token").notNull(),
  expiresAt: timestamp("expires_at"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const instagramFunnelRules = pgTable("instagram_funnel_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // "comment" (padrão, trava num post) | "story_reply" (qualquer story da
  // conta, sem post fixo — story expira em 24h, não faz sentido travar nele).
  triggerType: text("trigger_type").notNull().default("comment"),
  // Só preenchido quando triggerType = "comment".
  postId: text("post_id"),
  postThumbnailUrl: text("post_thumbnail_url"),
  postPermalink: text("post_permalink"),
  keyword: text("keyword").notNull(), // comparação: contém, case-insensitive
  message: text("message").notNull(),
  // Opcional — resposta pública embaixo do comentário, além do DM privado.
  // Exige a permissão instagram_business_manage_comments.
  publicReply: text("public_reply"),
  // Opcional — funil visual (instagram_funnels) que continua depois da 1ª
  // mensagem. set null: apagar o funil não apaga a regra, só desconecta.
  funnelId: uuid("funnel_id").references((): AnyPgColumn => instagramFunnels.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const instagramFunnelLeads = pgTable(
  "instagram_funnel_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => instagramFunnelRules.id, { onDelete: "cascade" }),
    commentId: text("comment_id").notNull(),
    igUsername: text("ig_username"),
    igUserId: text("ig_user_id").notNull(),
    commentText: text("comment_text").notNull(),
    status: text("status").notNull(), // sent | failed
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // Rede de segurança contra reprocessar o mesmo comentário duas vezes se
    // o webhook da Meta reentregar o mesmo evento.
    unique("instagram_funnel_leads_dedupe_key").on(t.ruleId, t.commentId),
  ]
);

// Funil visual (editor de blocos conectáveis) — continua a conversa no
// Direct depois da 1ª mensagem de uma regra.
export const instagramFunnels = pgTable("instagram_funnels", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const instagramFunnelNodes = pgTable("instagram_funnel_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  funnelId: uuid("funnel_id")
    .notNull()
    .references(() => instagramFunnels.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // trigger | message | condition | quick_reply
  positionX: integer("position_x").notNull().default(0),
  positionY: integer("position_y").notNull().default(0),
  message: text("message"), // type='message' (texto do DM) ou type='quick_reply' (pergunta que acompanha os botões)
  // Anexo opcional (ex: PDF) num bloco type='message' — a Meta exige URL
  // pública pra mandar anexo, servimos via rota própria (instagram-files.route.ts).
  fileBase64: text("file_base64"),
  fileMimetype: text("file_mimetype"),
  fileFilename: text("file_filename"),
  // só type='condition' — array de { id: uuid, keyword: string }, um por
  // saída (fora a saída fixa "Nenhuma bateu", que não precisa de linha própria)
  conditionKeywords: jsonb("condition_keywords").notNull().default([]),
  // só type='condition' — em vez de "contém a palavra" literal, manda a
  // resposta da pessoa pro GPT (chave OpenAI configurada em Configurações)
  // escolher qual palavra-chave melhor representa a intenção.
  conditionUseAi: boolean("condition_use_ai").notNull().default(false),
  // só type='quick_reply' — array de { id: uuid, label: string }, um botão
  // por entrada (fora a saída fixa "default", pra quando a pessoa ignora os
  // botões e digita em vez de tocar). Limite da Meta: até 13, 20 caracteres
  // por rótulo — validado no editor e truncado defensivamente no envio.
  quickReplyOptions: jsonb("quick_reply_options").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const instagramFunnelEdges = pgTable(
  "instagram_funnel_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    funnelId: uuid("funnel_id")
      .notNull()
      .references(() => instagramFunnels.id, { onDelete: "cascade" }),
    sourceNodeId: uuid("source_node_id")
      .notNull()
      .references(() => instagramFunnelNodes.id, { onDelete: "cascade" }),
    // null pra Gatilho/Mensagem (saída única); pro nó de Condição, o id de
    // uma entrada de condition_keywords, ou o literal "default".
    sourceHandle: text("source_handle"),
    targetNodeId: uuid("target_node_id")
      .notNull()
      .references(() => instagramFunnelNodes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // Cada saída só liga a um destino — "desconectar" é apagar a linha,
    // "conectar" é inserir (substitui se já tinha uma ligação ali).
    unique("instagram_funnel_edges_source_key").on(t.sourceNodeId, t.sourceHandle),
  ]
);

// Estado de "em qual bloco de Condição essa pessoa está esperando" —
// consultado quando chega uma mensagem nova no Direct.
export const instagramFunnelSessions = pgTable(
  "instagram_funnel_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    igUserId: text("ig_user_id").notNull(),
    funnelId: uuid("funnel_id")
      .notNull()
      .references(() => instagramFunnels.id, { onDelete: "cascade" }),
    currentNodeId: uuid("current_node_id")
      .notNull()
      .references(() => instagramFunnelNodes.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => instagramFunnelLeads.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // Uma pessoa só fica esperando em um funil por vez — entrar em outro sobrescreve.
    unique("instagram_funnel_sessions_user_key").on(t.organizationId, t.igUserId),
  ]
);

// ── Caixa de Entrada ─────────────────────────────────────────────────────
// Histórico de Direct — toda mensagem recebida ou enviada, tenha disparado
// automação ou não. Comentário não entra aqui (fica só em instagram_funnel_leads).

export const instagramConversations = pgTable(
  "instagram_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    igUserId: text("ig_user_id").notNull(),
    // Só preenchido se a pessoa já comentou alguma vez (reaproveitado de
    // instagram_funnel_leads) — a API de mensagens não devolve username.
    igUsername: text("ig_username"),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    lastMessagePreview: text("last_message_preview").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("instagram_conversations_user_key").on(t.organizationId, t.igUserId)]
);

export const instagramMessages = pgTable("instagram_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => instagramConversations.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(), // "in" | "out"
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- relations (usadas pelos joins via db.query.*) ---

export const organizationsRelations = relations(organizations, ({ many }) => ({
  profiles: many(profiles),
  appConfig: many(appConfig),
  instagramConnections: many(instagramConnections),
  instagramFunnelRules: many(instagramFunnelRules),
  instagramFunnels: many(instagramFunnels),
  instagramConversations: many(instagramConversations),
}));

export const usersRelations = relations(users, ({ one }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.id] }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  organization: one(organizations, { fields: [profiles.organizationId], references: [organizations.id] }),
}));

export const appConfigRelations = relations(appConfig, ({ one }) => ({
  organization: one(organizations, { fields: [appConfig.organizationId], references: [organizations.id] }),
}));

export const instagramConnectionsRelations = relations(instagramConnections, ({ one }) => ({
  organization: one(organizations, { fields: [instagramConnections.organizationId], references: [organizations.id] }),
}));

export const instagramFunnelRulesRelations = relations(instagramFunnelRules, ({ one, many }) => ({
  organization: one(organizations, { fields: [instagramFunnelRules.organizationId], references: [organizations.id] }),
  funnel: one(instagramFunnels, { fields: [instagramFunnelRules.funnelId], references: [instagramFunnels.id] }),
  leads: many(instagramFunnelLeads),
}));

export const instagramFunnelLeadsRelations = relations(instagramFunnelLeads, ({ one }) => ({
  rule: one(instagramFunnelRules, { fields: [instagramFunnelLeads.ruleId], references: [instagramFunnelRules.id] }),
}));

export const instagramFunnelsRelations = relations(instagramFunnels, ({ one, many }) => ({
  organization: one(organizations, { fields: [instagramFunnels.organizationId], references: [organizations.id] }),
  nodes: many(instagramFunnelNodes),
  edges: many(instagramFunnelEdges),
}));

export const instagramFunnelNodesRelations = relations(instagramFunnelNodes, ({ one }) => ({
  funnel: one(instagramFunnels, { fields: [instagramFunnelNodes.funnelId], references: [instagramFunnels.id] }),
}));

export const instagramFunnelEdgesRelations = relations(instagramFunnelEdges, ({ one }) => ({
  funnel: one(instagramFunnels, { fields: [instagramFunnelEdges.funnelId], references: [instagramFunnels.id] }),
}));

export const instagramFunnelSessionsRelations = relations(instagramFunnelSessions, ({ one }) => ({
  funnel: one(instagramFunnels, { fields: [instagramFunnelSessions.funnelId], references: [instagramFunnels.id] }),
  currentNode: one(instagramFunnelNodes, { fields: [instagramFunnelSessions.currentNodeId], references: [instagramFunnelNodes.id] }),
  lead: one(instagramFunnelLeads, { fields: [instagramFunnelSessions.leadId], references: [instagramFunnelLeads.id] }),
}));

export const instagramConversationsRelations = relations(instagramConversations, ({ one, many }) => ({
  organization: one(organizations, { fields: [instagramConversations.organizationId], references: [organizations.id] }),
  messages: many(instagramMessages),
}));

export const instagramMessagesRelations = relations(instagramMessages, ({ one }) => ({
  conversation: one(instagramConversations, { fields: [instagramMessages.conversationId], references: [instagramConversations.id] }),
}));
