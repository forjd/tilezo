CREATE INDEX "rooms_owner_user_id_idx" ON "rooms" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "rooms_visibility_name_id_idx" ON "rooms" USING btree ("visibility","name","id");--> statement-breakpoint
CREATE INDEX "room_items_room_id_idx" ON "room_items" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_items_room_id_position_idx" ON "room_items" USING btree ("room_id","x","y","z");
