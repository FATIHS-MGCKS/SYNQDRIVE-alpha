-- Fix ambiguous product_role reference in billing_validate_subscription_item trigger.
-- PL/pgSQL variable name collided with billing_catalog_products.product_role column.

CREATE OR REPLACE FUNCTION billing_validate_subscription_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  product_key TEXT;
  v_product_role "BillingProductRole";
  allow_multiple BOOLEAN;
  active_addon_count INTEGER;
BEGIN
  SELECT "key", "product_role", "allow_multiple_items"
    INTO product_key, v_product_role, allow_multiple
  FROM "billing_catalog_products"
  WHERE "id" = NEW."billing_product_id";

  IF v_product_role IS NULL THEN
    RAISE EXCEPTION 'Unknown billing product %', NEW."billing_product_id";
  END IF;

  IF NEW."item_role" = 'BASE_PLAN' THEN
    IF v_product_role <> 'BASE_PLAN' THEN
      RAISE EXCEPTION 'Base plan item requires BASE_PLAN product, got %', v_product_role;
    END IF;
    IF product_key NOT IN ('RENTAL', 'FLEET') THEN
      RAISE EXCEPTION 'Base plan must be RENTAL or FLEET, got %', product_key;
    END IF;
  ELSIF NEW."item_role" = 'ADDON' THEN
    IF v_product_role <> 'ADDON' THEN
      RAISE EXCEPTION 'Add-on item requires ADDON product, got %', v_product_role;
    END IF;
    IF NEW."status" IN ('ACTIVE', 'TRIALING')
       AND (NEW."valid_to" IS NULL OR NEW."valid_to" > CURRENT_TIMESTAMP)
       AND allow_multiple = false THEN
      SELECT COUNT(*) INTO active_addon_count
      FROM "billing_subscription_items"
      WHERE "organization_id" = NEW."organization_id"
        AND "billing_product_id" = NEW."billing_product_id"
        AND "item_role" = 'ADDON'
        AND "status" IN ('ACTIVE', 'TRIALING')
        AND ("valid_to" IS NULL OR "valid_to" > CURRENT_TIMESTAMP)
        AND ("id" IS DISTINCT FROM NEW."id");

      IF active_addon_count > 0 THEN
        RAISE EXCEPTION 'Add-on product % does not allow multiple active items', product_key;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
