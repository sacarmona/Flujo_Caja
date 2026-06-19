-- Bank opening balances can be zero or negative. Movement, payment and rate
-- amounts keep their positive-value constraints.
ALTER TABLE "OpeningBalance" DROP CONSTRAINT IF EXISTS "OpeningBalance_amount_positive_check";
