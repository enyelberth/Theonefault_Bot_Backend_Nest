CREATE OR REPLACE FUNCTION public.recalculate_all_account_balances()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "AccountBalance" ("accountId", "currencyCode", balance)
  SELECT
    jel."accountId",
    jel."currencyCode",
    SUM(
      CASE
        WHEN UPPER(COALESCE(jel."entryType", '')) IN ('INGRESO', 'DEBIT', 'DEBITO', 'DÉBITO') THEN jel.amount
        WHEN UPPER(COALESCE(jel."entryType", '')) IN ('EGRESO', 'CREDIT', 'CREDITO', 'CRÉDITO') THEN jel.amount * -1
        ELSE 0
      END
    ) AS balance
  FROM "JournalEntryLine" jel
  GROUP BY jel."accountId", jel."currencyCode"
  ON CONFLICT ("accountId", "currencyCode")
  DO UPDATE SET balance = EXCLUDED.balance;

  UPDATE "AccountBalance" ab
  SET balance = 0
  WHERE NOT EXISTS (
    SELECT 1
    FROM "JournalEntryLine" jel
    WHERE jel."accountId" = ab."accountId"
      AND jel."currencyCode" = ab."currencyCode"
  );
END;
$$;
