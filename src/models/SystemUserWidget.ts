import { User } from "@veap/auth/models";
import { type CastType, Model } from "@veap/database";

export interface SystemUserWidgetAttributes {
  userId: string;
  user_id?: string;
  slot: string;
  state: any;
}

export class SystemUserWidget extends Model<SystemUserWidgetAttributes> {
  static override table = "system_user_widgets";
  static override primaryKey = "user_id";
  static override autoUuid = false;
  static override timestamps = false;

  static override casts: Record<string, CastType> = {
    state: "json",
  };

  /**
   * Associated user relation.
   */
  user() {
    return this.belongsTo(User, "user_id");
  }
}
