import { type CastType, Model } from "@veap/database";

export interface SystemPluginAttributes {
  id: string;
  enabled: boolean;
  installed: boolean;
  deleted: boolean;
  system: boolean;
  config?: string | null;
  lastStep?: string | null;
  last_step?: string | null;
  updatedAt?: Date | null;
  updated_at?: Date | null;
}

export class SystemPlugin extends Model<SystemPluginAttributes> {
  static override table = "plugins";
  static override autoUuid = false;
  static override timestamps: boolean | string[] = ["updated_at"];

  static override casts: Record<string, CastType> = {
    enabled: "boolean",
    installed: "boolean",
    deleted: "boolean",
    system: "boolean",
    updatedAt: "datetime",
    updated_at: "datetime",
  };
}
