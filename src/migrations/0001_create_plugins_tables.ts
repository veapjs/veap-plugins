import type { Schema } from "@veap/database";

export const name = "0001_create_plugins_tables";

export async function up(_db: any, schema: Schema) {
  // 1. Plugins table
  await schema.createTable("plugins", (table) => {
    table.text("id").primaryKey();
    table.boolean("enabled").notNull().default(false);
    table.boolean("installed").notNull().default(false);
    table.boolean("deleted").notNull().default(false);
    table.boolean("system").notNull().default(false);
    table.text("config");
    table.text("last_step");
    table.timestamp("updated_at").defaultNow();
  });

  // 2. System user widgets table
  await schema.createTable("system_user_widgets", (table) => {
    table
      .text("user_id")
      .references("users", "id")
      .onDelete("CASCADE")
      .notNull();
    table.text("slot").notNull();
    table.jsonb("state").notNull().default("[]");

    table.primary(["user_id", "slot"]);
  });
}

export async function down(_db: any, schema: Schema) {
  await schema.dropTableIfExists("system_user_widgets");
  await schema.dropTableIfExists("plugins");
}
